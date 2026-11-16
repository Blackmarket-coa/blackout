import type { Server as HttpServer, IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import type { MiddlewareHandler } from 'hono';

/**
 * What the API does with its HTTP server when it is told to stop, before it
 * drains the store (src/index.ts).
 *
 * The store's write-behind queue holds writes the API has already answered,
 * so it may be drained only once no request can still add to it, and the
 * process exits once it is drained. Until 2026-11-16 the shutdown waited for
 * `server.close()` to call back before draining, and that never happens while
 * a client keeps a connection open. A keep-alive client that kept sending
 * requests was answered after the signal, each answer saying keep-alive; a
 * connection that had sent nothing, a request still arriving, an event stream
 * and a WebSocket are never closed by `close()` at all. The hard timeout then
 * ended the process with the queue undrained, and writes answered 201 were
 * lost (60 to 99 sign-ups in a few seconds of such traffic, measured). See
 * `KNOWN_LIMITATIONS.md`, "Stopping the API".
 *
 * From `begin()`:
 * - a request that arrives is answered 503 with `Connection: close` (the
 *   middleware), so nothing new is taken on;
 * - every response not yet sent says `Connection: close`, so each connection
 *   ends with the request it is carrying;
 * - the server stops listening, and idle connections are closed.
 * `closeWhenSettled(graceMs)` then waits until no request is in flight, or
 * until `graceMs` has passed, and closes every connection that is left,
 * upgraded (WebSocket) ones included. A request still running then loses its
 * connection, and its answer is never sent.
 */
export interface HttpShutdown {
    /** Hono middleware: once the shutdown has begun, answer 503. */
    middleware: MiddlewareHandler;
    /** Track the server's requests and upgraded sockets. Call once, straight after serve(). */
    attach(server: HttpServer): void;
    /** Whether begin() has been called. */
    readonly begun: boolean;
    /** Stop taking requests; see above. Idempotent. */
    begin(): void;
    /**
     * begin(), then wait until no request is in flight or `graceMs` has passed,
     * then close every connection. `settled` is false if the grace ran out,
     * and `inFlight` is how many requests were still running then.
     */
    closeWhenSettled(graceMs: number): Promise<{ settled: boolean; inFlight: number }>;
}

export const SHUTTING_DOWN_BODY = {
    code: 'shutting_down',
    message: 'This server is restarting. Try again in a moment.',
} as const;

export function createHttpShutdown(): HttpShutdown {
    const live = new Set<ServerResponse>();
    const upgraded = new Set<Duplex>();
    const onIdle = new Set<() => void>();
    let server: HttpServer | null = null;
    let begun = false;

    const closeOnFinish = (res: ServerResponse): void => {
        if (!res.headersSent) res.setHeader('Connection', 'close');
    };

    const middleware: MiddlewareHandler = async (c, next) => {
        if (!begun) {
            await next();
            return;
        }
        c.header('Connection', 'close');
        c.header('Retry-After', '1');
        return c.json(SHUTTING_DOWN_BODY, 503);
    };

    const attach = (target: HttpServer): void => {
        server = target;
        target.on('request', (_req: IncomingMessage, res: ServerResponse) => {
            live.add(res);
            if (begun) closeOnFinish(res);
            res.once('close', () => {
                live.delete(res);
                if (live.size === 0) for (const notify of [...onIdle]) notify();
            });
        });
        target.on('upgrade', (_req: IncomingMessage, socket: Duplex) => {
            upgraded.add(socket);
            socket.once('close', () => upgraded.delete(socket));
        });
    };

    const begin = (): void => {
        if (begun) return;
        begun = true;
        for (const res of live) closeOnFinish(res);
        if (!server) return;
        // Stops listening; on Node 19 and later it also closes idle connections.
        // A connection that becomes idle later carried an answer that said
        // `Connection: close`, or is closed by closeAll once nothing is in flight.
        server.close();
        server.closeIdleConnections();
    };

    const closeAll = (): void => {
        server?.closeAllConnections();
        for (const socket of upgraded) socket.destroy();
        upgraded.clear();
    };

    const closeWhenSettled = async (
        graceMs: number
    ): Promise<{ settled: boolean; inFlight: number }> => {
        begin();
        let settled = live.size === 0;
        if (!settled) {
            settled = await new Promise<boolean>((resolve) => {
                const finish = (value: boolean): void => {
                    clearTimeout(timer);
                    onIdle.delete(whenIdle);
                    resolve(value);
                };
                const whenIdle = (): void => finish(true);
                const timer = setTimeout(() => finish(false), graceMs);
                if (typeof timer.unref === 'function') timer.unref();
                onIdle.add(whenIdle);
            });
        }
        const inFlight = live.size;
        closeAll();
        return { settled, inFlight };
    };

    return {
        middleware,
        attach,
        get begun() {
            return begun;
        },
        begin,
        closeWhenSettled,
    };
}
