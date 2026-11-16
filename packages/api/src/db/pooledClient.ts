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

/**
 * Whether the connection still answers a statement. For a caller that nothing
 * waits on (raiseIdleSessionTimeoutTo below): the wait has no bound.
 */
const stillAnswers = async (client: { query(sql: string): Promise<unknown> }): Promise<boolean> => {
    try {
        await client.query('SELECT 1');
        return true;
    } catch {
        return false;
    }
};

/**
 * How long a statement sent on a connection after its work failed is waited
 * for (sendAfterFailure), in milliseconds.
 */
export const AFTER_FAILURE_WAIT_MS = 5_000;

/**
 * What came of a statement sent on a connection after its work failed:
 * - `answered`: the server answered it, so the connection is up;
 * - `failed`: it failed;
 * - `held`: it was not sent, because pg would not have sent it either (see
 *   holdsAStatement);
 * - `silent`: it neither was answered nor failed within the wait, or an
 *   earlier one on the same connection did not.
 */
export type AfterFailure = 'answered' | 'failed' | 'held' | 'silent';

/**
 * Whether pg still holds a statement as this client's active query: one it
 * has started to send and has had no ReadyForQuery for. pg (8.20.0,
 * lib/client.js _pulseQueryQueue) sends the next statement only once it has
 * that ReadyForQuery, so a statement given to such a client waits until the
 * server has finished the held one, or the socket closes.
 *
 * After work that waited for each of its statements has failed, pg holds one
 * in two cases, and in both the connection is up as far as pg knows:
 * - pg failed the statement itself before it was complete on the wire: a
 *   parameter it could not serialize (lib/utils.js prepareValue: an object
 *   that JSON.stringify refuses, such as one that holds a BigInt or a cycle,
 *   or one whose toPostgres or toJSON throws). lib/query.js prepare() has
 *   written Parse by then, hands the error to the caller, and sends neither
 *   Bind nor Sync. The server answers a Sync, and none is coming: pg sends
 *   nothing on that connection again;
 * - pg's read timeout failed it (`query_timeout`, which a connection string
 *   can carry) while the server is still at it. The ReadyForQuery comes when
 *   the server is done, however long that is.
 * A statement the server answered with an error is no longer held (pg clears
 * it in _handleErrorMessage), nor is one that failed with its connection
 * (_errorAllQueries).
 *
 * Read from pg's own `_getActiveQuery()` (8.20.0, lib/client.js). A client
 * without that method (a test's stand-in, or a pg that has dropped it) reads
 * as holding none, and is then sent the statement, under the wait that
 * bounds it (sendAfterFailure).
 */
const holdsAStatement = (client: object): boolean => {
    const activeQuery = (client as { _getActiveQuery?: unknown })._getActiveQuery;
    return typeof activeQuery === 'function' && Boolean(activeQuery.call(client));
};

/** Connections that left a statement of sendAfterFailure's unanswered. */
const silentConnections = new WeakSet<object>();

/**
 * Send `sql` on a connection whose work has just failed, and say what came of
 * it. Never rejects, and never waits longer than `withinMs`.
 *
 * Nothing more is sent on a connection that has left such a statement
 * unanswered before, and nothing on a client that pg will not send on
 * (holdsAStatement). The first is asked first: a statement this function
 * sent and was not answered is pg's active query from then on, and the
 * connection is `silent`, not `held`. Otherwise the statement is sent, and
 * what the connection gives first is the result: the server's answer, a
 * failure, or neither within `withinMs`. That last connection is logged
 * (`pg_connection_unanswered`) and remembered. The statement is still pg's
 * then, and pg fails it when the socket closes: pg's end(), which the pool
 * runs as it destroys the connection, destroys the socket where the
 * statement is pg's active query, but where it waits behind one the server
 * did not finish (a FATAL with no close after it) end() only closes the
 * process's side, and the server's side may never close. So
 * attemptOnPooledClient destroys a silent connection's socket once the
 * connection is given back (destroySocketOf). Either way the failure is
 * taken here.
 */
export async function sendAfterFailure(
    client: { query(sql: string): Promise<unknown> },
    sql: string,
    withinMs: number = AFTER_FAILURE_WAIT_MS
): Promise<AfterFailure> {
    if (silentConnections.has(client)) return 'silent';
    if (holdsAStatement(client)) return 'held';
    const sent = (async (): Promise<AfterFailure> => {
        try {
            await client.query(sql);
            return 'answered';
        } catch {
            return 'failed';
        }
    })();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const waited = new Promise<AfterFailure>((resolve) => {
        timer = setTimeout(() => resolve('silent'), withinMs);
    });
    const outcome = await Promise.race([sent, waited]);
    clearTimeout(timer);
    if (outcome === 'silent') {
        silentConnections.add(client);
        log.warn('pg_connection_unanswered', { statement: sql, waitedMs: withinMs });
    }
    return outcome;
}

/**
 * How many connections `pool` holds: pg-pool's `totalCount`, which counts the
 * idle ones, the ones checked out and the ones still connecting. Zero for a
 * pool that does not say.
 */
const connectionsHeldBy = (pool: object): number => {
    const held = (pool as { totalCount?: unknown }).totalCount;
    return typeof held === 'number' && Number.isInteger(held) && held > 0 ? held : 0;
};

/** What became of one piece of work on a pooled connection. */
export type PooledAttempt<T> =
    | { ok: true; value: T }
    | {
          ok: false;
          error: unknown;
          /** The pool gave a connection, and it had ended when the work failed. */
          connectionEnded: boolean;
          /**
           * Set where the connection gave no answer after the failure, and
           * so is not known to have ended: `held`, it was not asked, because
           * pg still holds the statement the work failed on and sends nothing
           * more on it until the server finishes that one, which for a
           * statement pg failed itself is never; `silent`, a statement sent
           * after the failure (SELECT 1, or a targeted write's ROLLBACK) was
           * neither answered nor failed within the wait.
           */
          unanswered?: 'held' | 'silent';
          /**
           * Connections the pool held besides this one when the failure was
           * found, counted before this one was given back. Zero where
           * `pool.connect()` failed, and for a pool that does not say.
           */
          othersHeld: number;
      };

/**
 * As withPooledClient, for a caller that tries failed work again and has to
 * know whether the connection was what failed: the write-behind queue
 * (db/writeBehindQueue.ts). The failure comes back as a value, with
 * `connectionEnded`.
 *
 * `connectionEnded` is not read off the error. A drop reaches the work as the
 * server's own error (its FATAL to the statement in flight), as pg's
 * ("Connection terminated unexpectedly", "Client has encountered a connection
 * error and is not queryable") or as the socket's (ECONNRESET), and of a
 * server error's severity pg-protocol (1.16.1) passes on only the wording.
 * So the connection is sent one more statement before it goes back
 * (sendAfterFailure, SELECT 1), and it had ended if that statement fails.
 * From pg 8.20.0's lib/client.js and lib/query.js, what the statement meets:
 * - after a FATAL the server sends no ReadyForQuery, so pg holds the
 *   statement back and fails it when the socket closes (_errorAllQueries);
 * - a client whose socket failed or closed is marked unqueryable
 *   (_handleErrorEvent), and pg fails the statement on the next tick;
 * - a connection that is up, with nothing of the work's still held by pg,
 *   answers. The work must not leave a failed transaction open on it: there
 *   the server refuses SELECT 1, which would read as ended (a targeted write
 *   rolls its transaction back first);
 * - a client on which pg still holds the failed statement is sent nothing
 *   (holdsAStatement): pg would keep SELECT 1 back behind that statement,
 *   for good where pg failed the statement itself. Not asked, it is not
 *   known to have ended: `connectionEnded` is false and `unanswered` is
 *   `held`.
 * So the wait is for the server's answer or for the socket to close, and it
 * is bounded: a connection that gives neither within `afterFailureWaitMs`
 * (a FATAL that arrived with no close after it; a proxy that keeps the
 * socket open and passes nothing on) is logged, and is not known to have
 * ended either: `connectionEnded` is false and `unanswered` is `silent`. One
 * that would have closed a moment later is taken for one that had not ended,
 * which costs a failure of that kind: the write's one retry. What the bound
 * costs is time: the caller waits that long, and for the write-behind queue,
 * which runs its writes one after another, so does every write behind it
 * (KNOWN_LIMITATIONS.md says what that does to a drain at shutdown). Where
 * the connection string carries
 * `query_timeout`, pg's read timeout is a second timer on SELECT 1: if it
 * is the shorter one and runs out first, SELECT 1 fails on a connection that
 * may be up, and that reads as ended.
 *
 * A connection still checked out when its socket closes reports the drop
 * itself, as an 'error' event: the shared pool's listener for a checked-out
 * connection takes it, logs it and counts it (`held`, config/postgres.ts).
 * On a pool with no such listener that event would end the process, as it
 * would under any second statement the work sends after a drop (a targeted
 * write's ROLLBACK).
 *
 * A failure to get a connection at all (`pool.connect()` rejects) is not a
 * connection that ended: nothing was handed out.
 *
 * The connection is given back with the error either way, as in
 * withPooledClient, so the pool destroys it. `othersHeld` is read just
 * before that. Giving a connection back can make the pool open another in
 * the same call, for a caller that was waiting for one (pg-pool 3.13.0
 * _remove: pg's end() calls back at once where the socket has already
 * closed, and the callback serves that caller), and that one was not there
 * when the failure was found. A `silent` connection's socket is then
 * destroyed as well (destroySocketOf, sendAfterFailure says why).
 */
export async function attemptOnPooledClient<
    C extends ReleasableClient & { query(sql: string): Promise<unknown> },
    T
>(
    pool: { connect(): Promise<C> },
    fn: (client: C) => Promise<T>,
    afterFailureWaitMs: number = AFTER_FAILURE_WAIT_MS
): Promise<PooledAttempt<T>> {
    let client: C;
    try {
        client = await pool.connect();
    } catch (error) {
        return { ok: false, error, connectionEnded: false, othersHeld: 0 };
    }
    let failure: Error | undefined;
    let asked: AfterFailure | undefined;
    try {
        return { ok: true, value: await fn(client) };
    } catch (error) {
        failure = asError(error);
        asked = await sendAfterFailure(client, 'SELECT 1', afterFailureWaitMs);
        return {
            ok: false,
            error,
            connectionEnded: asked === 'failed',
            ...(asked === 'held' || asked === 'silent' ? { unanswered: asked } : {}),
            othersHeld: Math.max(0, connectionsHeldBy(pool) - 1),
        };
    } finally {
        client.release?.(failure);
        if (asked === 'silent') destroySocketOf(client);
    }
}

/**
 * Destroy the socket of a connection that has just been given back with an
 * error. The close reaches pg on a later tick, by when the pool has ended the
 * client (pg-pool's release with an error runs pg's end() inside the call),
 * so pg takes it as an ended client's (lib/client.js, 8.20.0, the
 * connection's 'end' handler: it fails what still waits, "Connection
 * terminated", and emits no 'error'): it is not reported or counted as a
 * drop. Read from pg's `connection.stream`, as pg's own end() does; a client
 * without one (a test's stand-in) is left as it is.
 */
const destroySocketOf = (client: object): void => {
    const stream = (client as { connection?: { stream?: { destroy?: unknown } } }).connection
        ?.stream;
    if (typeof stream?.destroy === 'function') stream.destroy();
};

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
        // (1.16.1) passes on only the wording (the protocol's field S, not
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
