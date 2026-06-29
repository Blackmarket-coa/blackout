/**
 * Containment — structural rules that keep conflict inside the arena and prevent
 * obsessive feuding. Phase 1 implements the 48-hour cool-down: after a match
 * ends, neither participant can start a new one immediately.
 */

/** The post-match cool-down — the spec's 48 hours, in milliseconds. */
export const COOLDOWN_MS = 48 * 60 * 60 * 1000;

function parseMs(value: string | undefined): number | null {
    if (!value) return null;
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
}

/**
 * Whether a fighter is still inside the cool-down window after their last match
 * ended. `lastMatchEndedAt` is the ISO time of the most recent match the user
 * finished; undefined means they have no prior match and are free to start one.
 */
export function isUnderCooldown(
    lastMatchEndedAtIso: string | undefined,
    nowEpochMs: number = Date.now(),
    cooldownMs: number = COOLDOWN_MS
): boolean {
    const ended = parseMs(lastMatchEndedAtIso);
    if (ended === null) return false;
    return nowEpochMs - ended < cooldownMs;
}

/** Milliseconds remaining in the cool-down, or 0 if the fighter is free. */
export function cooldownRemainingMs(
    lastMatchEndedAtIso: string | undefined,
    nowEpochMs: number = Date.now(),
    cooldownMs: number = COOLDOWN_MS
): number {
    const ended = parseMs(lastMatchEndedAtIso);
    if (ended === null) return 0;
    const remaining = cooldownMs - (nowEpochMs - ended);
    return remaining > 0 ? remaining : 0;
}
