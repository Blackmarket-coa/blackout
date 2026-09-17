/**
 * Periodic driver for reading back what a coalition's posts got.
 *
 * Mirrors the other schedulers here: idempotent start/stop around a setInterval
 * with an overlap guard. Slow by default — this reads third-party APIs on
 * behalf of every coalition with a recent post, and a tight loop against two
 * services is how a credential gets rate limited.
 *
 * Gated behind the inbound flag, which is also checked inside the sweep itself.
 * Two checks rather than one because starting a timer that immediately no-ops
 * is a confusing thing to find in a log.
 */
import { sweepInboundActivity } from './coalitionInboundSync';
import { log } from '../telemetry/logger';

export const DEFAULT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

export const startCoalitionInboundScheduler = (
    intervalMs: number = DEFAULT_INTERVAL_MS
): { stop: () => void } => {
    if (timer) return { stop: stopCoalitionInboundScheduler };
    timer = setInterval(() => {
        if (running) return;
        running = true;
        void sweepInboundActivity()
            .catch((err) => {
                log.warn('coalition_inbound_sweep_threw', { error: String(err) });
            })
            .finally(() => {
                running = false;
            });
    }, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    return { stop: stopCoalitionInboundScheduler };
};

export const stopCoalitionInboundScheduler = (): void => {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
};

export const isCoalitionInboundSchedulerRunning = (): boolean => timer !== null;
