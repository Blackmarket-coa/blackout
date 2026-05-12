/**
 * Trial-mode math. Every new den starts in a 14-day try-before-commit
 * window (work-stream J1) so the brief's "every setting feels like a try,
 * not a commitment" lands literally. Pure helpers here so the banner UI
 * can stay presentation-only and the auto-commit job can reuse the same
 * thresholds.
 */

import type { DenPlaybookPayload, PlaybookId } from '@blackout/protocol';

const DAY_MS = 86_400_000;

export const DEFAULT_TRIAL_DAYS = 14;

export interface TrialStatus {
    /** True iff the playbook is currently in trial. */
    isTrial: boolean;
    /**
     * Whole days remaining in the trial window. Negative numbers mean the
     * trial has lapsed and the den is overdue for auto-commit to Hearth.
     */
    daysRemaining: number;
    /** ms timestamp when the trial began (parsed from `trialStartedAt`). */
    startedAtMs: number | null;
    /** ms timestamp when the trial ends. */
    endsAtMs: number | null;
}

const NO_TRIAL: TrialStatus = {
    isTrial: false,
    daysRemaining: 0,
    startedAtMs: null,
    endsAtMs: null,
};

/**
 * Pure: compute the trial status for a playbook payload + current time.
 * Robust to missing `trialStartedAt` (older payloads, or playbooks that
 * never started a trial); returns NO_TRIAL when fields are unparseable.
 */
export function computeTrialStatus(
    playbook: Pick<DenPlaybookPayload, 'mode' | 'trialStartedAt'>,
    nowMs: number = Date.now(),
    trialDays: number = DEFAULT_TRIAL_DAYS,
): TrialStatus {
    if (playbook.mode !== 'trial') return NO_TRIAL;
    if (!playbook.trialStartedAt) return NO_TRIAL;
    const start = Date.parse(playbook.trialStartedAt);
    if (!Number.isFinite(start)) return NO_TRIAL;
    const end = start + trialDays * DAY_MS;
    const remainingMs = end - nowMs;
    // Ceiling so the banner reads "1 day left" through the last day rather
    // than flicking to 0 a few hours early.
    const daysRemaining = Math.ceil(remainingMs / DAY_MS);
    return {
        isTrial: true,
        daysRemaining,
        startedAtMs: start,
        endsAtMs: end,
    };
}

/**
 * Pure: identify dens that have aged past their trial and never committed.
 * The brief calls for auto-commit to Hearth in that case (non-coercion).
 * Used by a (future) janitor job that walks composted/idle rooms; the
 * threshold function lives here so the UI banner and the janitor agree.
 */
export function trialHasLapsed(status: TrialStatus): boolean {
    return status.isTrial && status.daysRemaining < 0;
}

/**
 * Convenience: the playbook id to use when auto-committing to a safer
 * fallback at trial end. The brief is firm that the fallback is *Hearth*
 * (lowest-stakes default), regardless of the trial playbook.
 */
export const TRIAL_FALLBACK_PLAYBOOK: PlaybookId = 'hearth';
