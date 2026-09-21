/**
 * Periodic driver for the external-reply retention sweep.
 *
 * Mirrors the other schedulers here: idempotent start/stop around a setInterval
 * with an overlap guard. Daily by default — retention windows are measured in
 * days, so nothing is gained by asking more often, and the sweep walks the
 * whole table each time.
 *
 * Deliberately NOT gated on `BLACKOUT_COALITION_EXTERNAL_SYNC_ENABLED`. That
 * flag controls whether new replies arrive; the rows already held are owed
 * their retention whether or not more are coming. See the header of
 * `coalitionExternalRetention.ts`.
 */
import { sweepExternalActivityRetention } from './coalitionExternalRetention';
import { log } from '../telemetry/logger';

export const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

export const startCoalitionExternalRetentionScheduler = (
    intervalMs: number = DEFAULT_INTERVAL_MS
): { stop: () => void } => {
    if (timer) return { stop: stopCoalitionExternalRetentionScheduler };
    timer = setInterval(() => {
        if (running) return;
        running = true;
        try {
            sweepExternalActivityRetention();
        } catch (err) {
            log.warn('coalition_external_retention_sweep_threw', { error: String(err) });
        } finally {
            running = false;
        }
    }, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    return { stop: stopCoalitionExternalRetentionScheduler };
};

export const stopCoalitionExternalRetentionScheduler = (): void => {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
};

export const isCoalitionExternalRetentionSchedulerRunning = (): boolean => timer !== null;
