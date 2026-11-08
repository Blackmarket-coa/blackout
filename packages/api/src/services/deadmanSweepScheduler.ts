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
 * move is conditional in Postgres (`advanceDeadmanSwitch`) and reaches this
 * process's mirror only once Postgres has applied it, so an occasional overlap
 * of two processes, or a standby whose mirror lags, re-emits nothing and fires
 * nothing twice; a move whose statement fails or does not answer in time is
 * not made here, and the first pass after the database answers tries it again
 * (round 10 of part 2's review: on a database error the move was kept in the
 * mirror and its event emitted, and no pass tried it again). The store keeps
 * when its statements stood unanswered, and the sweep gives a switch due in
 * that time the backlog window rather than firing it, as after an outage of
 * its own (round 11); a check-in or cancel any process refused for want of
 * an answer reaches the sweep through the switch's own row once that
 * process's carry of it has landed (`ownerAttemptRefusedAt`, decision 31,
 * round 14; tried at once and every 10 seconds after a failed try, each on a
 * connection of its own, rounds 15 and 16), so the worker's sweep holds such
 * a switch back from then on, or, where its mirror has not yet heard of the
 * carry, from when Postgres refuses its trigger over it and it takes the row
 * (round 15).
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
/** Ticks skipped in a row because a pass was still running. */
let skipped = 0;

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
 * up to its own bound (`backgroundTicks.ts`). Each of those waits is bounded
 * (`switchStatementTimeoutMs`, 30 seconds: a move waits only for this
 * process's earlier writes of the same switch and for the database, not for
 * its writes to other tables), and while one has not answered the store sends
 * no further switch statement, so a stalled database ends a pass after about
 * one bound rather than holding it, and later passes end at once until the
 * statement settles, when the first pass after it tries the moves again and
 * gives a switch due during the stall the backlog window; a tick skipped
 * because a pass is still running is logged (`deadman_sweep_tick_skipped`),
 * counts only.
 */
export const startDeadmanSweepScheduler = (
    intervalMs: number = DEFAULT_INTERVAL_MS
): { stop: () => void } => {
    if (timer) return { stop: stopDeadmanSweepScheduler };
    const toleranceMs = backlogToleranceMs(intervalMs);
    timer = setInterval(() => {
        if (running) {
            skipped += 1;
            log.warn('deadman_sweep_tick_skipped', { skipped });
            return;
        }
        running = true;
        skipped = 0;
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
