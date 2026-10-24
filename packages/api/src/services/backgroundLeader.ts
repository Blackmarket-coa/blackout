import type { PgClient, PgPool } from '../db/migrate';
import { getSharedPgPool } from '../config/postgres';
import { RUNTIME_DB_MODE } from '../db/store';
import { log } from '../telemetry/logger';

/**
 * Fleet-wide leader election for the background-job loops.
 *
 * The loops (pollers, scheduled-message/content dispatchers, coalition surge,
 * FBM sweepers, and the dead-man's-switch sweep) must run on exactly one
 * process, or a horizontally-scaled deployment double-processes every job.
 * Previously the only guard was the BLACKOUT_BACKGROUND_WORKERS_DISABLED env
 * var — fail-open, so forgetting it on a second replica silently doubled work.
 *
 * In postgres mode we take a session-level Postgres advisory lock on a
 * dedicated connection held for the process's lifetime: only the lock holder
 * runs the loops, and if it dies the lock is released automatically and another
 * replica can take over on its next start. In file/memory mode there is a
 * single process by definition, so it is always the leader. The API (when it
 * runs the loops in-process) and the background worker take the same lock, so
 * they exclude each other too.
 *
 * Distinct from the migration advisory lock (0x424c4f43 in db/migrate.ts).
 */
export const BACKGROUND_LEADER_LOCK_KEY = 0x424c4f42;

/** How often a watched lock is re-checked, and how long one check may take. */
export const DEFAULT_LEADER_CHECK_INTERVAL_MS = 10_000;
export const DEFAULT_LEADER_CHECK_TIMEOUT_MS = 5_000;

/**
 * The held connection. A pg pool client is also an EventEmitter, and passing
 * release() an error destroys the connection instead of pooling it; the shared
 * PgClient type names neither.
 */
type LeaderClient = PgClient & {
    on?(event: 'error' | 'end', listener: (err?: unknown) => void): unknown;
    removeListener?(event: 'error' | 'end', listener: (err?: unknown) => void): unknown;
    release?(destroy?: Error): void;
};

let leaderClient: LeaderClient | null = null;

const asError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));

export const tryBecomeBackgroundLeader = async (): Promise<boolean> => {
    // Single-process runtimes are always the leader.
    if (RUNTIME_DB_MODE !== 'postgres') return true;

    try {
        return await acquireBackgroundLeaderLock(await getSharedPgPool());
    } catch (err) {
        // Fail SAFE: if leadership cannot be determined, do not run the loops, so a
        // DB blip can never cause two replicas to both process jobs. A dedicated
        // worker replica (or the next healthy start) picks them up.
        log.warn('background_leader_check_failed', { error: String(err) });
        return false;
    }
};

/**
 * The postgres half of tryBecomeBackgroundLeader: try for the lock on a
 * connection from `pool`. On success the connection is held (NOT released) so
 * the session-scoped lock is retained for this process's lifetime; otherwise it
 * goes back to the pool, or is destroyed if the query failed.
 */
export const acquireBackgroundLeaderLock = async (pool: PgPool): Promise<boolean> => {
    if (leaderClient) return true;
    const client = (await pool.connect()) as LeaderClient;
    let locked: boolean;
    try {
        const { rows } = await client.query<{ locked: boolean }>(
            'SELECT pg_try_advisory_lock($1) AS locked',
            [BACKGROUND_LEADER_LOCK_KEY]
        );
        locked = rows[0]?.locked === true;
    } catch (err) {
        client.release?.(asError(err));
        throw err;
    }
    if (!locked) {
        client.release?.();
        log.info('background_leader_not_acquired', {});
        return false;
    }
    leaderClient = client;
    log.info('background_leader_acquired', {});
    return true;
};

// Whether this session still holds the lock. A bigint key below 2^32 shows in
// pg_locks as classid 0, objid = key, objsubid 1.
const LOCK_HELD_SQL = `SELECT EXISTS (
    SELECT 1 FROM pg_locks
     WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND granted
       AND classid = 0 AND objid = $1::bigint::oid AND objsubid = 1
) AS held`;

const ignoreError = (): void => undefined;

/**
 * Watch the held lock, and call `onLost` once when it can no longer be
 * trusted: the connection errors or ends, or a periodic check finds the lock
 * not held, fails, or gets no answer within `checkTimeoutMs`. The connection
 * is then destroyed rather than pooled, and this process is no longer the
 * leader; the background worker stops its loops. No-op where no lock is held
 * (file/memory mode). Returns a function that stops watching.
 *
 * Unwatched, an error on the held connection is an unhandled `error` event
 * (the pool takes its own listener off a client while it is checked out), so
 * the process crashes rather than run on without the lock. That is still the
 * API's behaviour: it runs no watch.
 */
export const watchBackgroundLeadership = (
    onLost: (reason: string) => void,
    options: { checkIntervalMs?: number; checkTimeoutMs?: number } = {}
): (() => void) => {
    const client = leaderClient;
    if (!client) return () => undefined;
    const checkIntervalMs = options.checkIntervalMs ?? DEFAULT_LEADER_CHECK_INTERVAL_MS;
    const checkTimeoutMs = options.checkTimeoutMs ?? DEFAULT_LEADER_CHECK_TIMEOUT_MS;
    let watching = true;
    let checking = false;

    const stop = (): void => {
        watching = false;
        clearInterval(interval);
        client.removeListener?.('error', onError);
        client.removeListener?.('end', onEnd);
    };
    const lose = (reason: string, err?: unknown): void => {
        if (!watching) return;
        stop();
        if (leaderClient === client) leaderClient = null;
        client.release?.(new Error(`background leader lock lost: ${reason}`));
        log.error('background_leader_lost', {
            reason,
            ...(err === undefined ? {} : { error: String(err) }),
        });
        onLost(reason);
    };
    const onError = (err?: unknown): void => lose('connection_error', err);
    const onEnd = (): void => lose('connection_ended');
    const check = async (): Promise<void> => {
        if (checking || !watching) return;
        checking = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const timeout = new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error('lock check timed out')), checkTimeoutMs);
            });
            const { rows } = await Promise.race([
                client.query<{ held: boolean }>(LOCK_HELD_SQL, [BACKGROUND_LEADER_LOCK_KEY]),
                timeout,
            ]);
            if (rows[0]?.held !== true) lose('lock_not_held');
        } catch (err) {
            lose('lock_check_failed', err);
        } finally {
            clearTimeout(timer);
            checking = false;
        }
    };

    // Stays on the client for good: an error after a stop or a loss must not
    // crash the process.
    client.on?.('error', ignoreError);
    client.on?.('error', onError);
    client.on?.('end', onEnd);
    const interval = setInterval(() => void check(), checkIntervalMs);
    if (typeof interval.unref === 'function') interval.unref();
    return stop;
};

/** Release the advisory lock + dedicated connection on graceful shutdown. */
export const releaseBackgroundLeader = async (): Promise<void> => {
    const client = leaderClient;
    if (!client) return;
    leaderClient = null;
    try {
        await client.query('SELECT pg_advisory_unlock($1)', [BACKGROUND_LEADER_LOCK_KEY]);
    } catch (err) {
        // The lock goes when the connection drops, so a connection whose unlock
        // failed is destroyed, never pooled with the lock possibly still held.
        client.release?.(asError(err));
        return;
    }
    client.release?.();
};

/** Test-only: whether this process currently holds the leader lock. */
export const isBackgroundLeader = (): boolean => leaderClient !== null;
