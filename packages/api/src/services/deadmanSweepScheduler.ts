import { log } from '../telemetry/logger';
import { sweepOverdueDeadmanSwitches } from '../modules/deadman';
import { trackBackgroundTick } from './backgroundTicks';
import { BACKLOG_TOLERANCE_FLOOR_MS, backlogToleranceMs } from './backlogTolerance';

/**
 * Autonomous dead-man's-switch sweep loop.
 *
 * A dead-man's switch must fire when its owner has gone dark — precisely the
 * moment no client is around to call an endpoint. No request can do that;
 * this loop can, because it runs server-side on a timer with no user present.
 * It is the only code path that moves a switch forward: the owner-scoped
 * `POST /v1/deadman/process-overdue` route that also did was removed (D6).
 *
 * On by default (BLACKOUT_DEADMAN_SWEEP !== '0'), like the scheduled-message
 * dispatcher, because it backs a first-party safety feature rather than an
 * optional integration. Single-process by design (mirrors the other
 * schedulers): in postgres mode the background-leader advisory lock
 * (services/backgroundLeader.ts) keeps the loops to one process.
 * `evaluateTransition` is idempotent for already-fired switches, and each
 * move is conditional in Postgres (`advanceDeadmanSwitch`), so an occasional
 * overlap of two processes, or a standby whose mirror lags, re-emits nothing
 * and fires nothing twice.
 *
 * Its backlog tolerance follows its cadence (backlogTolerance.ts): a switch it
 * reaches later than that gets a backlog grace window instead of firing.
 */

export const DEFAULT_INTERVAL_MS = 30 * 1000; // 30 seconds

/**
 * The sweep's cadence as this deployment configures it:
 * `BLACKOUT_DEADMAN_SWEEP_INTERVAL_SECONDS`, or the default. The notifier
 * runs at the same cadence, and `GET /v1/deadman/limits` derives the backlog
 * tolerance the arming form states from it, so the text matches what the
 * sweep does.
 */
export const deadmanSweepIntervalMs = (): number => {
    const seconds = Number.parseInt(process.env.BLACKOUT_DEADMAN_SWEEP_INTERVAL_SECONDS ?? '', 10);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_INTERVAL_MS;
};

let timer: ReturnType<typeof setInterval> | null = null;
/** Whether the interval's pass is running, so one that outlives the interval is not overlapped. */
let running = false;

/** Run one sweep pass. Returns the number of switches whose status advanced. */
export const runDeadmanSweep = async (
    now: Date = new Date(),
    toleranceMs: number = BACKLOG_TOLERANCE_FLOOR_MS
): Promise<number> => {
    const processed = await sweepOverdueDeadmanSwitches(now, toleranceMs);
    if (processed > 0) log.info('deadman_sweep_processed', { processed });
    return processed;
};

/**
 * Start the periodic sweep. Idempotent — repeat calls return the same stop
 * handle. The timer is `.unref()`'d so it never keeps the process alive alone.
 * A pass awaits the database for each switch it moves in Postgres
 * (`advanceDeadmanSwitch`), so, as the notifier does, the next pass does not
 * start while one runs, and the worker's shutdown waits for a pass in flight
 * up to its own bound (`backgroundTicks.ts`).
 */
export const startDeadmanSweepScheduler = (
    intervalMs: number = DEFAULT_INTERVAL_MS
): { stop: () => void } => {
    if (timer) return { stop: stopDeadmanSweepScheduler };
    const toleranceMs = backlogToleranceMs(intervalMs);
    timer = setInterval(() => {
        if (running) return;
        running = true;
        void trackBackgroundTick(runDeadmanSweep(new Date(), toleranceMs))
            .catch((err) => {
                log.warn('deadman_sweep_tick_threw', { error: String(err) });
            })
            .finally(() => {
                running = false;
            });
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
