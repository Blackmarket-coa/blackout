/**
 * How late a periodic loop may reach due work before the lateness itself says
 * the loop was not running (the worker was down, the dispatcher was switched
 * off, the store was not loaded) rather than ordinary tick spacing and retries.
 *
 * Two loops act on it. The scheduled-message dispatcher does not send a
 * message it reaches this late; it expires it. The dead-man sweep does not
 * fire a switch it reaches this late; it gives the switch one backlog grace
 * window. Fifteen minutes is thirty ticks at either loop's default 30-second
 * cadence. A custom cadence keeps the tolerance at ten intervals at least, so
 * a slow loop never reads its own tick spacing as an outage: the dispatcher's
 * five attempts at a failing message take four intervals after the first.
 */

export const BACKLOG_TOLERANCE_FLOOR_MS = 15 * 60 * 1000;
export const BACKLOG_TOLERANCE_INTERVALS = 10;

/** The tolerance for a loop that ticks every `intervalMs`. */
export const backlogToleranceMs = (intervalMs: number): number =>
    Math.max(BACKLOG_TOLERANCE_FLOOR_MS, BACKLOG_TOLERANCE_INTERVALS * intervalMs);
