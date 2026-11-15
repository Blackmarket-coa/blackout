// Checking a client out of a pg pool, and giving it back.

import { log } from '../telemetry/logger';

/** A client as pg-pool hands one out. */
export interface ReleasableClient {
    /** With an error, pg-pool destroys the connection instead of pooling it. */
    release?(err?: Error): void;
}

const asError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));

/**
 * Run `fn` on a client checked out of `pool`, then give the client back: with
 * the error `fn` failed with, if it failed, so that pg-pool destroys the
 * connection instead of pooling it.
 *
 * A plain release() can pool a dead connection. When the server ends a backend
 * while a query is in flight (pg_terminate_backend, a restart, a failover), pg
 * (8.20.0) hands the server's FATAL to that query and marks the client unusable
 * only when the socket closes, a moment later. A plain release() in between
 * puts the client back in the idle list, and the next connect() can hand that
 * same client out; the write-behind queue's immediate retry got it, failed
 * with "Connection terminated unexpectedly", and dropped a write that Postgres
 * was up to take. Destroying the client on any error also closes a connection
 * that an error left usable (a constraint violation); the pool opens a
 * replacement when it next has no idle connection to hand out.
 */
export async function withPooledClient<C extends ReleasableClient, T>(
    pool: { connect(): Promise<C> },
    fn: (client: C) => Promise<T>
): Promise<T> {
    const client = await pool.connect();
    let failure: Error | undefined;
    try {
        return await fn(client);
    } catch (err) {
        failure = asError(err);
        throw err;
    } finally {
        client.release?.(failure);
    }
}

/** Connections on which exemptFromIdleSessionTimeout's statement took effect. */
const exemptSessions = new WeakSet<object>();
let exemptionFailureLogged = false;

/**
 * Turn the server's idle_session_timeout off for one connection that the
 * process holds idle on purpose: the LISTEN connection (db/pgNotify.ts), which
 * sends nothing after LISTEN, and the background-leader lock's
 * (services/backgroundLeader.ts), which sends one check every 10 s. With a
 * role or database idle_session_timeout the server ended the first once every
 * timeout period, each time costing a reconnect and a re-hydrate of every
 * table, and with a timeout under 10 s it ended the second soon after every
 * acquisition. The setting exists from PostgreSQL 14, and any role may change
 * it for its own session.
 *
 * Only for those two. The pool's other connections stay under the server's
 * timeout: one the server ends while it sits idle is dropped and replaced
 * (config/postgres.ts).
 *
 * Never fails the connection. A server that refuses the statement (one older
 * than 14 has no such setting) leaves the connection as it was, and so does
 * any other failure; a connection that failed because it is gone is found by
 * the next statement on it or by its 'error' listener. The first failure in a
 * process is logged, later ones are not.
 */
export async function exemptFromIdleSessionTimeout(client: {
    query(sql: string): Promise<unknown>;
}): Promise<void> {
    try {
        await client.query('SET idle_session_timeout = 0');
        exemptSessions.add(client);
    } catch (err) {
        if (exemptionFailureLogged) return;
        exemptionFailureLogged = true;
        const code = (err as { code?: unknown } | null)?.code;
        // The message and code only, as for a dropped connection
        // (config/postgres.ts): a pg error can carry the connection parameters.
        log.info('pg_idle_session_timeout_not_exempted', {
            ...(typeof code === 'string' ? { code } : {}),
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

/**
 * Put the server's idle_session_timeout back in force on a connection
 * exempted above, before it returns to the pool as an ordinary connection.
 * Nothing is sent on a connection the exemption never took effect on. Rejects
 * if the statement fails; the caller then destroys the connection rather than
 * pool it still exempt.
 */
export async function restoreIdleSessionTimeout(client: {
    query(sql: string): Promise<unknown>;
}): Promise<void> {
    if (!exemptSessions.has(client)) return;
    await client.query('RESET idle_session_timeout');
    exemptSessions.delete(client);
}

/** For tests: let the next exemption failure be logged again. */
export function forgetIdleSessionExemptionFailureForTests(): void {
    exemptionFailureLogged = false;
}
