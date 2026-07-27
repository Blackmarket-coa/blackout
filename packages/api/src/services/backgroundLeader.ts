import type { PgClient } from '../db/migrate';
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
 * single process by definition, so it is always the leader.
 *
 * Distinct from the migration advisory lock (0x424c4f43 in db/migrate.ts).
 */
const BACKGROUND_LEADER_LOCK_KEY = 0x424c4f42;

let leaderClient: PgClient | null = null;

export const tryBecomeBackgroundLeader = async (): Promise<boolean> => {
    // Single-process runtimes are always the leader.
    if (RUNTIME_DB_MODE !== 'postgres') return true;

    try {
        const pool = await getSharedPgPool();
        const client = await pool.connect();
        const { rows } = await client.query<{ locked: boolean }>(
            'SELECT pg_try_advisory_lock($1) AS locked',
            [BACKGROUND_LEADER_LOCK_KEY]
        );
        const locked = rows[0]?.locked === true;
        if (locked) {
            // Hold the connection (do NOT release it) so the session-scoped lock is
            // retained for this process's lifetime.
            leaderClient = client;
            log.info('background_leader_acquired', {});
        } else {
            client.release?.();
            log.info('background_leader_not_acquired', {});
        }
        return locked;
    } catch (err) {
        // Fail SAFE: if leadership cannot be determined, do not run the loops, so a
        // DB blip can never cause two replicas to both process jobs. A dedicated
        // worker replica (or the next healthy start) picks them up.
        log.warn('background_leader_check_failed', { error: String(err) });
        return false;
    }
};

/** Release the advisory lock + dedicated connection on graceful shutdown. */
export const releaseBackgroundLeader = async (): Promise<void> => {
    const client = leaderClient;
    if (!client) return;
    leaderClient = null;
    try {
        await client.query('SELECT pg_advisory_unlock($1)', [BACKGROUND_LEADER_LOCK_KEY]);
    } catch {
        // Best-effort: the lock is released automatically when the connection drops.
    }
    client.release?.();
};

/** Test-only: whether this process currently holds the leader lock. */
export const isBackgroundLeader = (): boolean => leaderClient !== null;
