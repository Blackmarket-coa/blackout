import { startBackgroundLoops, type BackgroundLoopsHandle } from './backgroundLoops';
import { DEFAULT_STANDBY_RETRY_MS } from './backgroundWorker';
import { tryBecomeBackgroundLeader, watchBackgroundLeadership } from './services/backgroundLeader';
import { backgroundTicksInFlight } from './services/backgroundTicks';
import { log } from './telemetry/logger';

/**
 * The background loops when the API runs them itself (src/index.ts, started
 * without BLACKOUT_BACKGROUND_WORKERS_DISABLED=1), as in the deployments that
 * have no separate worker: the single-server baseline, the Kubernetes phase4
 * manifest and the Helm chart.
 *
 * Only the holder of the background-leader lock runs them. In postgres mode
 * the lock lives on a held pool connection, and every Postgres restart,
 * failover or network reset drops it. The API then stops its loops and stays
 * up, serving requests with its write-behind queue intact, and tries for the
 * lock again every `retryMs` (the worker's standby interval); once it has the
 * lock it starts the loops again. While a tick it started before the loss is
 * still running (services/backgroundTicks.ts) it does not try, so a restarted
 * loop never runs beside one of its own earlier ticks. An API that does not
 * get the lock at boot stands by the same way, so that the loops start on
 * one of the replicas left when the process holding the lock is gone. Until
 * 2026-11-16 it never tried again, and the loops then ran nowhere unless a
 * worker was on standby.
 *
 * The worker (src/backgroundWorker.ts) exits 1 instead and comes back through
 * its restart policy; an API that exited would stop serving requests until its
 * container came back.
 */

/** How the API takes and watches the leader lock (a seam for tests). */
export interface InProcessLeadership {
    tryAcquire(): Promise<boolean>;
    /** Call `onLost` if the held lock is lost; returns a function that stops watching. */
    watch(onLost: (reason: string) => void): () => void;
}

const advisoryLockLeadership: InProcessLeadership = {
    tryAcquire: tryBecomeBackgroundLeader,
    watch: (onLost) => watchBackgroundLeadership(onLost),
};

export interface InProcessBackgroundLoopsOptions {
    leadership?: InProcessLeadership;
    startLoops?: () => BackgroundLoopsHandle;
    retryMs?: number;
}

export interface InProcessBackgroundLoops {
    /**
     * Stop the loops and any retry. Settles once a lock attempt already under
     * way has settled, so that a lock it took is held by the time the shutdown
     * calls releaseBackgroundLeader, which gives it back.
     */
    stop(): Promise<void>;
}

/** Take the leader lock and run the loops while it is held; see above. */
export function runBackgroundLoopsWhileLeader(
    options: InProcessBackgroundLoopsOptions = {}
): InProcessBackgroundLoops {
    const leadership = options.leadership ?? advisoryLockLeadership;
    const startLoops = options.startLoops ?? startBackgroundLoops;
    const retryMs = options.retryMs ?? DEFAULT_STANDBY_RETRY_MS;

    let stopped = false;
    let loops: BackgroundLoopsHandle | null = null;
    let stopWatching: (() => void) | null = null;
    let retryTimer: ReturnType<typeof setInterval> | null = null;
    let attempt: Promise<boolean> = Promise.resolve(false);

    const standBy = (): void => {
        let attempting = false;
        retryTimer = setInterval(() => {
            if (attempting || stopped || backgroundTicksInFlight() > 0) return;
            attempting = true;
            void tryLead()
                .then((led) => {
                    if (led && retryTimer) {
                        clearInterval(retryTimer);
                        retryTimer = null;
                    }
                })
                .finally(() => {
                    attempting = false;
                });
        }, retryMs);
        if (typeof retryTimer.unref === 'function') retryTimer.unref();
    };

    const onLost = (reason: string): void => {
        stopWatching = null;
        loops?.stop();
        loops = null;
        if (stopped) return;
        log.warn('background_loops_stopped_leader_lost', { reason, retryMs });
        standBy();
    };

    // One attempt at the lock; with it, watch it and start the loops.
    const tryLead = (): Promise<boolean> => {
        attempt = (async () => {
            try {
                if (!(await leadership.tryAcquire())) return false;
                // A stop that came while the lock was being taken starts
                // nothing; the shutdown's releaseBackgroundLeader gives it back.
                if (stopped) return true;
                stopWatching = leadership.watch(onLost);
                loops = startLoops();
                log.info('background_loops_started', {});
                return true;
            } catch (err) {
                log.warn('background_loops_lead_failed', { error: String(err) });
                return false;
            }
        })();
        return attempt;
    };

    void tryLead().then((led) => {
        if (led) return;
        log.info('background_loops_skipped_not_leader', { retryMs });
        if (!stopped) standBy();
    });

    return {
        stop: async () => {
            stopped = true;
            if (retryTimer) clearInterval(retryTimer);
            retryTimer = null;
            await attempt;
            stopWatching?.();
            stopWatching = null;
            loops?.stop();
            loops = null;
        },
    };
}
