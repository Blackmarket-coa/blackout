/**
 * Periodic driver for Coalition Surge detection. Mirrors
 * scheduledMessageDispatcher: an idempotent start/stop pair around a setInterval
 * that runs assessAndUpdateSurges each tick. Single-process by design (like the
 * other schedulers) — a multi-replica deployment would need a postgres advisory
 * lock; the open-per-project unique index bounds the blast radius regardless.
 */
import { assessAndUpdateSurges } from './coalitionSurge';
import { log } from '../telemetry/logger';

export const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

export const startCoalitionSurgeScheduler = (
    intervalMs: number = DEFAULT_INTERVAL_MS
): { stop: () => void } => {
    if (timer) return { stop: stopCoalitionSurgeScheduler };
    timer = setInterval(() => {
        // Guard against overlapping ticks if a pass ever runs long.
        if (running) return;
        running = true;
        try {
            const result = assessAndUpdateSurges(Date.now());
            if (result.opened || result.expired) {
                log.info('coalition_surge_sweep', {
                    opened: result.opened,
                    expired: result.expired,
                });
            }
        } catch (err) {
            log.warn('coalition_surge_sweep_threw', { error: String(err) });
        } finally {
            running = false;
        }
    }, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    return { stop: stopCoalitionSurgeScheduler };
};

export const stopCoalitionSurgeScheduler = (): void => {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
};

export const isCoalitionSurgeSchedulerRunning = (): boolean => timer !== null;
