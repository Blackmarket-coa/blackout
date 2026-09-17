/**
 * Periodic driver for automated coalition cross-posting. Mirrors
 * `coalitionSurgeScheduler`: an idempotent start/stop pair around a setInterval
 * with an overlap guard.
 *
 * Single-process by design, like the other schedulers here. What makes that
 * safe for this one specifically is that the sweep is idempotent on its own —
 * a partial-unique index on (campaign, platform, milestone) is what stops a
 * duplicate announcement, not the assumption that only one timer is running.
 * Two replicas would race to post and one would lose on the index rather than
 * producing two posts.
 *
 * The default cadence is deliberately slow. This is not a queue drain: a
 * milestone that lands three minutes late is indistinguishable to a reader,
 * and a fast timer against four third-party APIs is how an account gets rate
 * limited.
 */
import { sweepAutoCrossposts } from './coalitionAutoCrosspost';
import { log } from '../telemetry/logger';

export const DEFAULT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

export const startCoalitionAutoCrosspostScheduler = (
    intervalMs: number = DEFAULT_INTERVAL_MS
): { stop: () => void } => {
    if (timer) return { stop: stopCoalitionAutoCrosspostScheduler };
    timer = setInterval(() => {
        // A pass makes real network calls, so it can outlive its interval.
        if (running) return;
        running = true;
        void sweepAutoCrossposts()
            .catch((err) => {
                log.warn('coalition_autopost_sweep_threw', { error: String(err) });
            })
            .finally(() => {
                running = false;
            });
    }, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    return { stop: stopCoalitionAutoCrosspostScheduler };
};

export const stopCoalitionAutoCrosspostScheduler = (): void => {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
};

export const isCoalitionAutoCrosspostSchedulerRunning = (): boolean => timer !== null;
