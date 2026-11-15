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

/** Connections whose idle_session_timeout one of the statements below changed. */
const changedSessions = new WeakSet<object>();
let exemptionFailureLogged = false;

/**
 * Turn the server's idle_session_timeout off for the LISTEN connection
 * (db/pgNotify.ts), which the process holds idle on purpose: nothing is sent
 * on it after LISTEN. With a role or database idle_session_timeout the server
 * ended it once every timeout period, each time costing a reconnect and a
 * re-hydrate of every table. The setting exists from PostgreSQL 14, and any
 * role may change it for its own session.
 *
 * Only for that connection. The background-leader lock's sends a statement
 * every lock check, so it keeps a timeout (raiseIdleSessionTimeoutTo below).
 * The pool's other connections stay under the server's timeout: one the
 * server ends while it sits idle is dropped and replaced (config/postgres.ts).
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
        changedSessions.add(client);
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
 * Read this session's idle_session_timeout and, where it is set and shorter
 * than $1 milliseconds, raise it to that, in one statement: the server decides
 * and changes in one step. `raised_to` is set_config's answer where the
 * timeout was raised, and null where it was left alone (off, or $1 or
 * longer). pg_settings gives the value in milliseconds (checked on PostgreSQL
 * 16 and 17), and the statement matches no other unit. A server with no such
 * setting (older than PostgreSQL 14) has no row.
 */
const RAISE_IDLE_SESSION_TIMEOUT_SQL = `SELECT s.setting,
       CASE WHEN s.setting::bigint > 0 AND s.setting::bigint < $1::bigint
            THEN set_config('idle_session_timeout', $1::bigint::text || 'ms', false)
       END AS raised_to
  FROM pg_settings s
 WHERE s.name = 'idle_session_timeout' AND s.unit = 'ms'`;
let raiseFailureLogged = false;

/** Whether the connection still answers a statement. */
const stillAnswers = (client: { query(sql: string): Promise<unknown> }): Promise<boolean> =>
    client.query('SELECT 1').then(
        () => true,
        () => false
    );

/**
 * Raise this session's idle_session_timeout to `floorMs` if the server has
 * one shorter than that. For a connection held with a statement sent on it
 * at a steady interval well under `floorMs`: the background-leader lock's
 * (services/backgroundLeader.ts), with its lock check. Such a connection
 * needs help only against a timeout too short for that interval, and it is
 * not exempted: a timeout is what ends the session, and frees the lock, when
 * the process holding it is gone and the server has not seen it go (a network
 * reset that never reached the server, a lost host).
 *
 * One statement, and the server decides, by the session's timeout in
 * pg_settings:
 * - off (0): nothing is changed;
 * - `floorMs` or longer: nothing is changed, and the operator's timeout is
 *   what ends a session whose client is gone;
 * - shorter: it is set to `floorMs`, not turned off, so the server still
 *   ends such a session, `floorMs` after its last statement;
 * - no such setting (a server older than PostgreSQL 14): no row comes back,
 *   and nothing is changed.
 * Reading and raising are one step on the server, so a short timeout cannot
 * run out between them, and nothing depends on this process once the
 * statement is sent. What is left is the time before that: from the server's
 * answer to the caller's previous statement until this one reaches it.
 *
 * The statement is sent at once, and a caller that does not wait for the
 * promise waits for nothing: one that must see a dropped connection at once
 * puts its 'error' listener on first. A raise the server made is remembered
 * for restoreIdleSessionTimeout whether or not the caller still wants the
 * connection when the answer comes. `wanted` is asked then: nothing is
 * logged, and nothing more is sent, for a connection the caller has given
 * up.
 *
 * Never fails the connection and never rejects: a statement that fails
 * leaves the session as it was. The first refusal in a process is logged,
 * the missing setting included, and later ones are not. A failure is a
 * refusal only where the connection outlives it (see the catch below): none
 * is logged for a connection that went with the statement.
 */
export async function raiseIdleSessionTimeoutTo(
    client: { query(sql: string, params?: unknown[]): Promise<unknown> },
    floorMs: number,
    wanted: () => boolean
): Promise<void> {
    const passOver = (reason: string, err?: unknown): void => {
        if (raiseFailureLogged) return;
        raiseFailureLogged = true;
        const code = (err as { code?: unknown } | null)?.code;
        // The message and code only, as above.
        log.info('pg_idle_session_timeout_not_raised', {
            reason,
            ...(typeof code === 'string' ? { code } : {}),
            ...(err === undefined
                ? {}
                : { error: err instanceof Error ? err.message : String(err) }),
        });
    };
    try {
        const { rows } = (await client.query(RAISE_IDLE_SESSION_TIMEOUT_SQL, [floorMs])) as {
            rows?: Array<{ setting?: unknown; raised_to?: unknown }>;
        };
        const row = rows?.[0];
        const raised = typeof row?.raised_to === 'string';
        // The server has raised it, whether or not the caller still wants the
        // connection: remembered, so that giving it back puts the timeout back.
        if (raised) changedSessions.add(client);
        if (!wanted()) return;
        if (!row) return passOver('no_such_setting');
        if (raised) {
            log.info('pg_idle_session_timeout_raised', {
                fromMs: Number(row.setting),
                toMs: floorMs,
            });
        }
    } catch (err) {
        // Not the server's answer to the statement where the connection went
        // with it. A caller that has given the connection up knows that
        // already: pg (8.20.0) tells a connection's 'error' listener of a
        // reset before it fails the statement in flight. A server that ends
        // the session (a restart, a failover, pg_terminate_backend) answers
        // the statement first, with a FATAL error, and pg reports the drop
        // only when the socket closes, a moment later. The error is not
        // relied on to tell the two apart: of its severity, pg-protocol
        // (1.13.0) passes on only the wording (the protocol's field S, not
        // its field V). So the connection is asked. After a FATAL no
        // statement is answered: pg holds this one back until the socket
        // closes and fails it then, after the 'error' listeners have run. The
        // failure is a refusal only if the connection answers. Nothing is
        // asked of a connection the caller has given up, or once the
        // process has logged a refusal.
        if (raiseFailureLogged || !wanted() || !(await stillAnswers(client))) return;
        passOver('failed', err);
    }
}

/**
 * Put the server's idle_session_timeout back in force on a connection changed
 * above, before it returns to the pool as an ordinary connection. Nothing is
 * sent on a connection neither statement took effect on. Rejects if the
 * statement fails; the caller then destroys the connection rather than pool
 * it with a timeout that is not the server's.
 *
 * A caller need not have waited for its statement above. Whether it took
 * effect is still known here, because each caller comes here only after a
 * later statement on the same connection has been answered (the LISTEN
 * connection's UNLISTEN, the lock's unlock), and a connection answers its
 * statements in the order sent. The lock's raise is sent when its watch
 * starts, and the release stops the watch before it sends the unlock, so
 * nothing of the watch's follows the unlock.
 */
export async function restoreIdleSessionTimeout(client: {
    query(sql: string): Promise<unknown>;
}): Promise<void> {
    if (!changedSessions.has(client)) return;
    await client.query('RESET idle_session_timeout');
    changedSessions.delete(client);
}

/** For tests: let the next failure of each statement be logged again. */
export function forgetIdleSessionFailuresForTests(): void {
    exemptionFailureLogged = false;
    raiseFailureLogged = false;
}
