import { writeFileSync } from 'node:fs';

import { startBackgroundLoops, type BackgroundLoopsHandle } from './backgroundLoops';
import type { PgPool } from './db/migrate';
import { bootPostgresRuntimeStore } from './db/runtimeStoreBoot';
import { drainRuntimeStore, RUNTIME_DB_MODE } from './db/store';
import {
    releaseBackgroundLeader,
    tryBecomeBackgroundLeader,
    watchBackgroundLeadership,
} from './services/backgroundLeader';
import { backgroundTicksInFlight, waitForBackgroundTicks } from './services/backgroundTicks';
import { log } from './telemetry/logger';

/**
 * The background worker: what the production `worker` service runs
 * (src/worker.ts) to own the periodic job loops while the app replicas serve
 * requests only.
 *
 * Before any loop starts it loads the store exactly as the API does
 * (bootPostgresRuntimeStore: migrations, checksum audit, hydration). It then
 * takes the background-leader lock, the advisory lock the API also takes when
 * it runs the loops in-process, so at most one process runs them however the
 * replicas are configured. A worker that does not get the lock stands by and
 * tries again on an interval. A leader that loses the lock (its connection
 * failed, or the lock is no longer held) stops its loops and exits 1; the
 * container's restart policy brings it back through the same boot. On SIGTERM
 * or SIGINT it starts no new work, lets running ticks finish for up to half
 * the shutdown budget, flushes the store, releases the lock, closes the pool
 * and exits 0. If the whole drain outlasts the budget it exits 1.
 */

export const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;
export const DEFAULT_STANDBY_RETRY_MS = 15_000;
/** Docker's default stop grace period, and the API's SHUTDOWN_TIMEOUT_MS default. */
export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

/** How the worker takes, watches and gives up the leader lock (a seam for tests). */
export interface BackgroundWorkerLeadership {
    tryAcquire(): Promise<boolean>;
    /** Call `onLost` if a held lock is lost; returns a function that stops watching. */
    watch(onLost: (reason: string) => void): () => void;
    release(): Promise<void>;
}

const advisoryLockLeadership: BackgroundWorkerLeadership = {
    tryAcquire: tryBecomeBackgroundLeader,
    watch: (onLost) => watchBackgroundLeadership(onLost),
    release: releaseBackgroundLeader,
};

export interface BackgroundWorkerOptions {
    heartbeatPath: string;
    heartbeatIntervalMs?: number;
    standbyRetryMs?: number;
    shutdownTimeoutMs?: number;
    exit?: (code: number) => void;
    leadership?: BackgroundWorkerLeadership;
}

export type BackgroundWorkerRole = 'starting' | 'standby' | 'leader' | 'stopping';

export interface BackgroundWorker {
    /** Boot, then lead or stand by. Rejects if the worker must not run (workerRuntimeProblems). */
    start(): Promise<void>;
    /** Drain and exit. Safe at any point, and more than once (later calls join the first). */
    shutdown(reason: string, exitCode?: number): Promise<void>;
    role(): BackgroundWorkerRole;
}

/**
 * What the worker refuses to run with. In production it needs the shared
 * Postgres store: any other mode is a separate store inside the container,
 * empty or stale, which is how every loop here once did nothing. It also needs
 * the log salt the API requires. In postgres mode it needs the change feed:
 * it always runs beside the app replicas, and with BLACKOUT_DB_PG_NOTIFY=0 its
 * mirror would never see a message scheduled, a switch armed or a check-in
 * made on a replica after it booted.
 */
export function workerRuntimeProblems(env: NodeJS.ProcessEnv, dbMode: string): string[] {
    const problems: string[] = [];
    if (env.NODE_ENV === 'production' && dbMode !== 'postgres') {
        problems.push(
            `BLACKOUT_DB_MODE=${dbMode} is not permitted for the production worker; set ` +
                'BLACKOUT_DB_MODE=postgres (with DATABASE_URL) so it works on the shared store.'
        );
    }
    if (env.NODE_ENV === 'production' && !env.LOG_HASH_SALT) {
        problems.push(
            'LOG_HASH_SALT must be set in production so pseudonymized identifiers in logs are ' +
                'not reversible via the known default salt.'
        );
    }
    if (dbMode === 'postgres' && env.BLACKOUT_DB_PG_NOTIFY === '0') {
        problems.push(
            'BLACKOUT_DB_PG_NOTIFY=0 is not permitted for the worker: without the change feed ' +
                'its store never sees what the app replicas write after it boots.'
        );
    }
    return problems;
}

export function createBackgroundWorker(options: BackgroundWorkerOptions): BackgroundWorker {
    const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    const standbyRetryMs = options.standbyRetryMs ?? DEFAULT_STANDBY_RETRY_MS;
    const shutdownTimeoutMs = options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
    const exit = options.exit ?? ((code: number) => process.exit(code));
    const leadership = options.leadership ?? advisoryLockLeadership;

    let role: BackgroundWorkerRole = 'starting';
    let pool: PgPool | null = null;
    let loops: BackgroundLoopsHandle | null = null;
    let stopWatching: (() => void) | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let standbyTimer: ReturnType<typeof setInterval> | null = null;
    let starting: Promise<void> | null = null;
    let leadAttempt: Promise<boolean> | null = null;
    let stopping = false;
    let stopped: Promise<void> | null = null;

    const writeHeartbeat = (): void => {
        try {
            writeFileSync(options.heartbeatPath, `${Date.now()}\n`);
        } catch (err) {
            log.warn('worker_heartbeat_write_failed', {
                error: String(err),
                path: options.heartbeatPath,
            });
        }
    };

    // One attempt at the lock; on success, watch it and start the loops.
    const tryLead = (): Promise<boolean> => {
        leadAttempt = (async () => {
            if (!(await leadership.tryAcquire())) return false;
            // A shutdown that began while the lock was being taken starts
            // nothing; it releases the lock on its way out.
            if (stopping) return true;
            role = 'leader';
            stopWatching = leadership.watch((reason) => {
                void shutdown(`leader_lock_lost:${reason}`, 1);
            });
            loops = startBackgroundLoops();
            await loops.ready;
            log.info('background_loops_started', {});
            return true;
        })();
        return leadAttempt;
    };

    const standBy = (): void => {
        role = 'standby';
        log.info('background_worker_standby', { retryMs: standbyRetryMs });
        let attempting = false;
        standbyTimer = setInterval(() => {
            if (attempting || stopping) return;
            attempting = true;
            tryLead()
                .then((led) => {
                    if (led && standbyTimer) {
                        clearInterval(standbyTimer);
                        standbyTimer = null;
                    }
                })
                .catch((err) => {
                    log.error('background_worker_lead_failed', { error: String(err) });
                    void shutdown('lead_failed', 1);
                })
                .finally(() => {
                    attempting = false;
                });
        }, standbyRetryMs);
    };

    const start = (): Promise<void> => {
        starting ??= (async () => {
            const problems = workerRuntimeProblems(process.env, RUNTIME_DB_MODE);
            if (problems.length > 0) {
                throw new Error(
                    `Background worker configuration refused:\n - ${problems.join('\n - ')}`
                );
            }
            if (RUNTIME_DB_MODE === 'postgres') {
                // Checksum drift fails a production boot, as it does the API's.
                pool = await bootPostgresRuntimeStore({
                    failOnChecksumDrift: process.env.NODE_ENV === 'production',
                });
            }
            if (stopping) return;
            // The heartbeat starts once the store is loaded: a healthy worker
            // is one that can act on real data, as leader or on standby.
            writeHeartbeat();
            heartbeatTimer = setInterval(writeHeartbeat, heartbeatIntervalMs);
            log.info('blackout_worker_started', { heartbeatPath: options.heartbeatPath });
            if (await tryLead()) return;
            if (!stopping) standBy();
        })();
        return starting;
    };

    const shutdown = (reason: string, exitCode = 0): Promise<void> => {
        stopped ??= (async () => {
            stopping = true;
            log.info('blackout_worker_stopping', { reason, role });
            role = 'stopping';
            const force = setTimeout(() => {
                log.warn('blackout_worker_shutdown_forced_after_timeout', {
                    reason,
                    timeoutMs: shutdownTimeoutMs,
                });
                exit(1);
            }, shutdownTimeoutMs);
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            if (standbyTimer) clearInterval(standbyTimer);
            // No new ticks from here on.
            stopWatching?.();
            loops?.stop();
            // A boot or a lock attempt still in progress starts nothing now
            // (both check `stopping`); let it settle, so a lock it took is
            // released below.
            await starting?.catch(() => undefined);
            await leadAttempt?.catch(() => undefined);

            const settled = await waitForBackgroundTicks(Math.floor(shutdownTimeoutMs / 2));
            if (!settled) {
                log.warn('background_ticks_abandoned_at_shutdown', {
                    inFlight: backgroundTicksInFlight(),
                });
            }
            try {
                await drainRuntimeStore();
                log.info('runtime_store_drained', { reason });
            } catch (err) {
                log.warn('runtime_store_drain_failed', { error: String(err) });
            }
            // After the flush, so a worker that takes over finds every write
            // this one made.
            try {
                await leadership.release();
            } catch (err) {
                log.warn('background_leader_release_failed', { error: String(err) });
            }
            try {
                await pool?.end();
            } catch (err) {
                log.warn('pg_pool_end_failed', { error: String(err) });
            }
            clearTimeout(force);
            log.info('blackout_worker_stopped', { reason, exitCode });
            exit(exitCode);
        })();
        return stopped;
    };

    return { start, shutdown, role: () => role };
}
