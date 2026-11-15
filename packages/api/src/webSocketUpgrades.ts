/**
 * WebSocket upgrades on the API's http server.
 *
 * Three compatibility shims answer upgrade requests, each through its own
 * `upgrade` listener: Twitch IRC on exactly `/twitch-irc`, OBS-WebSocket under
 * `/obs-ws/` and the StreamElements socket.io endpoint at `/se-overlay/`.
 * `attachWebSocketShims` is the one place they are attached, and it installs
 * `guardUpgradedSockets` before any of them.
 *
 * Why the guard. Node removes its own `'error'` listener from a socket before
 * it emits `upgrade`, and once any `upgrade` listener exists it hands every
 * request that asks for an upgrade (`Upgrade` with `Connection: upgrade`) to
 * the listeners, whatever the path. A shim that does not recognise the path
 * returns without touching the socket. engine.io ends an upgrade it does not
 * recognise from a 1,000 ms timer, and only on a connection that has sent no
 * byte yet; on one that has already carried a response, nothing ended it.
 * For as long as the socket stayed open nothing listened for its errors, so a
 * client that reset the connection raised an unhandled `'error'` event and
 * the process exited: one request, with no session, on `/v1/health` or any
 * other path no shim takes
 * (docs/security/dependency-advisories-2026-11-14.md).
 */
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import type { ServerType } from '@hono/node-server';
import { log } from './telemetry/logger';
import { httpUpgradesUnclaimedTotal } from './telemetry/metrics';

/**
 * The answer to an upgrade nobody took. No body, and none of the app's
 * headers: the request never reached the Hono app.
 */
const UNCLAIMED_RESPONSE =
    'HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n';

/**
 * How long the `404` has to leave before the socket is destroyed without it.
 * It leaves at once unless the connection still owes earlier answers to a
 * client that is not reading them. engine.io gives an upgrade it does not
 * recognise the same second.
 */
const UNCLAIMED_CLOSE_TIMEOUT_MS = 1_000;

/** At most one `http_upgrade_unclaimed` line per guard in this long. */
const UNCLAIMED_LOG_INTERVAL_MS = 10_000;

/**
 * All of the request the log line carries: the first path segment, and only
 * when it is short and plain (`/v1`, `/socket.io`). No header, no query
 * string and nothing after the first segment, where this API's routes put
 * share, webhook and canary tokens (`/i/:token`, `/ct/:token`,
 * `/discord-compat/webhooks/:id/:token`); a segment that is long or has other
 * characters is not logged at all.
 */
const PLAIN_FIRST_SEGMENT = /^\/[a-z0-9._-]{0,24}(?=[/?#]|$)/;
const firstSegment = (target: string | undefined): string =>
    PLAIN_FIRST_SEGMENT.exec(target ?? '')?.[0] ?? '(other)';

/**
 * Keeps an upgraded socket from ever raising an unhandled `'error'`, and
 * closes the ones no listener takes.
 *
 * 1. Before it returns, the listener gives the socket an `'error'` listener
 *    that stays for the socket's life. Node drops its own and emits `upgrade`
 *    in one synchronous step, and a stream emits `'error'` on a later tick, so
 *    no error can be emitted while the socket has none: whichever shims are
 *    attached, in whatever order, and whether or not one takes the socket.
 *    The guard is prepended, so it runs first wherever it was attached.
 * 2. One turn of the event loop later, when every `upgrade` listener has run,
 *    it looks at what they left. A socket is taken if a listener ended it,
 *    destroyed it, or attached an `'error'` listener of its own (the first
 *    line of `ws`'s `handleUpgrade`, which each of the three shims reaches
 *    before its listener returns for a request it accepts). Any other socket
 *    is ended with a `404` there and then, counted, and logged at most once
 *    per interval. It is destroyed when the `404` has left, and after
 *    `UNCLAIMED_CLOSE_TIMEOUT_MS` whether it has left or not.
 *
 * Bytes written are not a sign that a listener took the socket, though
 * engine.io reads them so. On a connection that has been kept alive the
 * earlier responses are in `bytesWritten`, and when a client sends a plain
 * request and an upgrade in one write, Node hands the upgrade over while the
 * plain request is still being answered. `'error'` listeners are counted
 * from what the socket had at the hand-off, since a server may give every
 * connection one when it accepts it.
 *
 * So a listener must take the socket it wants before it returns, and writing
 * to it is not enough. One that has to wait first attaches its own `'error'`
 * listener before it waits, and that is the claim.
 * test/websocket-upgrade-guard.integration.test.ts holds the three shims to
 * this: each still upgrades through the guard.
 *
 * The `404` goes out after whatever the connection has written by then. A
 * plain request sent ahead of the upgrade in the same write, and not answered
 * within that turn of the loop, is not answered: the connection is closed.
 * If its answer closes the connection, Node ends the socket itself; that
 * looks like a listener ending it, and the upgrade goes with the connection,
 * unanswered and uncounted. And if the client is not reading the answers
 * sent ahead of the upgrade, the `404` waits behind them: the socket is
 * destroyed after the timeout, with the `404` and whatever else was still
 * queued unsent.
 *
 * Returns a function that removes the listener.
 */
export const guardUpgradedSockets = (server: HttpServer): (() => void) => {
    let lastLineAt = 0;
    let sinceLastLine = 0;

    const closeUnclaimed = (req: IncomingMessage, socket: Duplex): void => {
        httpUpgradesUnclaimedTotal.inc();
        sinceLastLine += 1;
        // False when the client's reset got here first: nothing to answer.
        // True says the `404` was written to the socket, not that it arrived.
        const answered = !socket.destroyed;
        if (answered) {
            // `finish` comes when the `404` has left Node, which it cannot do
            // while earlier answers are queued for a client that does not
            // read. Such a client does not get to keep the socket open.
            const giveUp = setTimeout(() => socket.destroy(), UNCLAIMED_CLOSE_TIMEOUT_MS);
            giveUp.unref();
            socket.once('close', () => clearTimeout(giveUp));
            socket.once('finish', () => socket.destroy());
            socket.end(UNCLAIMED_RESPONSE);
        }
        const now = Date.now();
        if (now - lastLineAt < UNCLAIMED_LOG_INTERVAL_MS) return;
        log.info('http_upgrade_unclaimed', {
            firstSegment: firstSegment(req.url),
            answered,
            // Unclaimed upgrades since the previous line, this one included.
            count: sinceLastLine,
        });
        lastLineAt = now;
        sinceLastLine = 0;
    };

    const onUpgrade = (req: IncomingMessage, socket: Duplex): void => {
        const errorListenersBefore = socket.listenerCount('error');
        let errored = false;
        socket.on('error', () => {
            errored = true;
        });
        setImmediate(() => {
            const taken =
                socket.writableEnded ||
                socket.listenerCount('error') > errorListenersBefore + 1 ||
                // Destroyed by a listener, not by an error: the OBS shim
                // closes a path with no password id without answering.
                (socket.destroyed && !errored);
            if (!taken) closeUnclaimed(req, socket);
        });
    };

    // First in line: every other listener, whenever it was attached, is handed
    // a socket that already has its error listener.
    server.prependListener('upgrade', onUpgrade);
    return () => {
        server.off('upgrade', onUpgrade);
    };
};

/**
 * Attaches the guard, then the three shims. Call it straight after `serve()`:
 * the guard is attached before this returns, the shims as their dynamic
 * imports resolve (they keep `ws` and socket.io out of processes that do not
 * listen). The promise resolves, once all three are attached, to a function
 * that detaches them and the guard; it rejects if a shim fails to load.
 */
export const attachWebSocketShims = (served: ServerType): Promise<() => void> => {
    // serve() is typed for HTTP/2 servers as well; the API gives it no
    // createServer option, so what it returns is an http.Server.
    const server = served as HttpServer;
    const removeGuard = guardUpgradedSockets(server);
    return Promise.all([
        // Twitch-IRC-compatible bot shim. External chat bots (Nightbot etc.)
        // upgrade to ws on /twitch-irc, authenticate with the bot tokens minted
        // at /v1/integrations/twitch-compat/bot-tokens, and run unmodified.
        import('./integrations/twitch-compat/ircServer').then(({ attachTwitchIrcShim }) => {
            const detach = attachTwitchIrcShim(server);
            log.info('twitch_irc_shim_attached', { path: '/twitch-irc' });
            return detach;
        }),
        // OBS-WebSocket v5 compatibility shim. External control surfaces
        // (Bitfocus Companion, Stream Deck, Touch Portal) upgrade to ws on
        // /obs-ws/<password-id>, complete the OBS-WS challenge/response auth,
        // and issue OBS-WS requests we dispatch via the protocol layer's
        // request matrix.
        import('./integrations/obs-ws-compat/server').then(({ attachObsWsShim }) => {
            const detach = attachObsWsShim(server);
            log.info('obs_ws_shim_attached', { pathPrefix: '/obs-ws/' });
            return detach;
        }),
        // StreamElements OverlayWS-compatible socket.io shim. Off-the-shelf
        // SE browser-source overlay HTML connects to /se-overlay/, emits
        // `authenticate` with a widgetAlertToken, and receives the same
        // alerts as the SSE feed at /v1/widget-alerts/stream — but in the
        // SE-shaped `event` frame so existing SE overlay HTML works
        // unmodified.
        import('./integrations/se-overlay-compat/server').then(({ attachSeOverlayShim }) => {
            const detach = attachSeOverlayShim(server);
            log.info('se_overlay_shim_attached', { path: '/se-overlay/' });
            return detach;
        }),
    ]).then((detachShims) => () => {
        for (const detach of detachShims) detach();
        removeGuard();
    });
};

export const __test__ = { firstSegment };
