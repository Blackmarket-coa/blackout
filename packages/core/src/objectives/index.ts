/**
 * Shared-objective progress (System 5 — cooperative gamification).
 *
 * Deterministic, side-effect-free aggregation so the client and any future
 * renderer agree on the same thermometer for the same contributions. Mirrors
 * the `reputation`/`governance` pure-logic modules.
 *
 * Banlist invariant (the binding System-5 design constraint): progress is
 * **aggregate-only**. We return a running total, a clamped percent, and a
 * *distinct contributor count* — never a per-member breakdown, ranking, or
 * attribution. Contributing earns no XP/reputation; this module deliberately
 * has no notion of "who contributed most". A shared *goal*, not a shared
 * *reward*.
 */

export interface ObjectiveProgressContribution {
    /**
     * Distinct contributor identity (e.g. a Matrix user id). Used ONLY to
     * compute a privacy-preserving distinct count — it is never returned,
     * ranked, or attributed by this module.
     */
    contributorId: string;
    /** Amount logged toward the goal. Non-positive values are ignored. */
    amount: number;
}

export interface ObjectiveProgress {
    /** Sum of all positive contributions. */
    current: number;
    /** The objective's target. */
    target: number;
    /** Completion percentage, clamped to 0–100 and rounded. */
    percent: number;
    /** Number of *distinct* contributors who logged a positive amount. */
    contributorCount: number;
    /** True once `current` reaches `target` (and the target is positive). */
    met: boolean;
}

/**
 * Fold a list of contributions into aggregate progress toward `target`.
 * Returns totals and a distinct-contributor count only — by construction it
 * exposes no per-contributor data.
 */
export function aggregateObjectiveProgress(
    target: number,
    contributions: readonly ObjectiveProgressContribution[],
): ObjectiveProgress {
    const safeTarget = Number.isFinite(target) && target > 0 ? target : 0;

    let current = 0;
    const contributors = new Set<string>();
    for (const contribution of contributions) {
        const amount = contribution.amount;
        if (!Number.isFinite(amount) || amount <= 0) continue;
        current += amount;
        if (contribution.contributorId) contributors.add(contribution.contributorId);
    }

    const percent =
        safeTarget > 0 ? Math.min(100, Math.max(0, Math.round((current / safeTarget) * 100))) : 0;

    return {
        current,
        target: safeTarget,
        percent,
        contributorCount: contributors.size,
        met: safeTarget > 0 && current >= safeTarget,
    };
}
