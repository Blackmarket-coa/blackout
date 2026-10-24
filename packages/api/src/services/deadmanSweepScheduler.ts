import { log } from '../telemetry/logger';
import { sweepOverdueDeadmanSwitches } from '../modules/deadman';
import { BACKLOG_TOLERANCE_FLOOR_MS, backlogToleranceMs } from './backlogTolerance';

/**
 * Autonomous dead-man's-switch sweep loop.
 *
 * A dead-man's switch must fire when its owner has gone dark — precisely the
 * moment no client is around to call an endpoint. The owner-scoped
 * `POST /v1/deadman/process-overdue` endpoint cannot do that; this loop can,
 * because it runs server-side on a timer with no user present.
 *
 * On by default (BLACKOUT_DEADMAN_SWEEP !== '0'), like the scheduled-message
 * dispatcher, because it backs a first-party safety feature rather than an
 * optional integration. Single-process by design (mirrors the other
 * schedulers): in postgres mode the background-leader advisory lock
 * (services/backgroundLeader.ts) keeps the loops to one process.
 * `evaluateTransition` is idempotent for already-fired switches, so an
 * occasional overlap re-emits nothing.
 *
 * Its backlog tolerance follows its cadence (backlogTolerance.ts): a switch it
 * reaches later than that gets a backlog grace window instead of firing.
 */

export const DEFAULT_INTERVAL_MS = 30 * 1000; // 30 seconds

let timer: ReturnType<typeof setInterval> | null = null;

/** Run one sweep pass. Returns the number of switches whose status advanced. */
export const runDeadmanSweep = (
    now: Date = new Date(),
    toleranceMs: number = BACKLOG_TOLERANCE_FLOOR_MS
): number => {
    const processed = sweepOverdueDeadmanSwitches(now, toleranceMs);
    if (processed > 0) log.info('deadman_sweep_processed', { processed });
    return processed;
};

/**
 * Start the periodic sweep. Idempotent — repeat calls return the same stop
 * handle. The timer is `.unref()`'d so it never keeps the process alive alone.
 */
export const startDeadmanSweepScheduler = (
    intervalMs: number = DEFAULT_INTERVAL_MS
): { stop: () => void } => {
    if (timer) return { stop: stopDeadmanSweepScheduler };
    const toleranceMs = backlogToleranceMs(intervalMs);
    timer = setInterval(() => {
        try {
            runDeadmanSweep(new Date(), toleranceMs);
        } catch (err) {
            log.warn('deadman_sweep_tick_threw', { error: String(err) });
        }
    }, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    return { stop: stopDeadmanSweepScheduler };
};

export const stopDeadmanSweepScheduler = (): void => {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
};

export const isDeadmanSweepSchedulerRunning = (): boolean => timer !== null;
