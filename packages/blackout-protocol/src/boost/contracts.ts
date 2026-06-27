/**
 * Governance Boost / Hype Train contract.
 *
 * A "boost" is a time-boxed community momentum event (hype train, fundraiser
 * rally, proposal boost, bounty boost). It is recorded as a `co.bmc.boost`
 * **state event** in the creator's Space/room (state key = `boostId`) so it is
 * live over Matrix sync: the in-room BoostBar reads it directly and re-renders
 * as contributions land. FBM owns the money and pushes `currentCents` updates by
 * re-writing this state event via the Blackout boost endpoint.
 */

export const BOOST_EVENT_TYPE = 'co.bmc.boost' as const;

export const BOOST_EVENT_SCHEMA_VERSION = 1 as const;

export const BOOST_TYPES = [
    'hype_train',
    'fundraiser_rally',
    'proposal_boost',
    'bounty_boost',
] as const;
export type BoostType = (typeof BOOST_TYPES)[number];

export interface BoostMilestone {
    /** Threshold (minor units) at which this milestone unlocks. */
    atCents: number;
    /** Short reward description shown on the bar. */
    reward: string;
}

export interface BoostEventContent {
    schemaVersion: number;
    boostId: string;
    type: BoostType;
    /** Target the community is driving toward, in minor units. */
    goalCents: number;
    /** Amount raised so far, in minor units. Updated by FBM. */
    currentCents: number;
    currency: string;
    milestones: BoostMilestone[];
    /** ISO-8601 timestamps. */
    startedAt: string;
    expiresAt: string;
    /** Linked FBM product (fundraiser rally) / proposal / bounty, when applicable. */
    linkedProductId?: string;
    linkedProposalId?: string;
    linkedBountyId?: string;
    /** Set when the boost is over (expired or goal met + closed). */
    status?: 'active' | 'completed' | 'expired';
}

export const isBoostType = (value: unknown): value is BoostType =>
    typeof value === 'string' && (BOOST_TYPES as readonly string[]).includes(value);

const isMilestone = (value: unknown): value is BoostMilestone => {
    if (!value || typeof value !== 'object') return false;
    const m = value as Record<string, unknown>;
    return (
        typeof m.atCents === 'number' &&
        Number.isFinite(m.atCents) &&
        m.atCents > 0 &&
        typeof m.reward === 'string'
    );
};

export const isBoostEventContent = (value: unknown): value is BoostEventContent => {
    if (!value || typeof value !== 'object') return false;
    const b = value as Record<string, unknown>;
    if (typeof b.schemaVersion !== 'number') return false;
    if (typeof b.boostId !== 'string' || b.boostId.length === 0) return false;
    if (!isBoostType(b.type)) return false;
    if (typeof b.goalCents !== 'number' || !Number.isFinite(b.goalCents) || b.goalCents <= 0) {
        return false;
    }
    if (typeof b.currentCents !== 'number' || !Number.isFinite(b.currentCents) || b.currentCents < 0) {
        return false;
    }
    if (typeof b.currency !== 'string' || b.currency.length === 0) return false;
    if (!Array.isArray(b.milestones) || !b.milestones.every(isMilestone)) return false;
    if (typeof b.startedAt !== 'string') return false;
    if (typeof b.expiresAt !== 'string') return false;
    if (b.linkedProductId !== undefined && typeof b.linkedProductId !== 'string') return false;
    if (b.linkedProposalId !== undefined && typeof b.linkedProposalId !== 'string') return false;
    if (b.linkedBountyId !== undefined && typeof b.linkedBountyId !== 'string') return false;
    if (
        b.status !== undefined &&
        b.status !== 'active' &&
        b.status !== 'completed' &&
        b.status !== 'expired'
    ) {
        return false;
    }
    return true;
};

/** True when the boost is currently running (not over and within its window). */
export const isBoostActive = (boost: BoostEventContent, nowMs: number): boolean => {
    if (boost.status === 'completed' || boost.status === 'expired') return false;
    const expiresMs = Date.parse(boost.expiresAt);
    return Number.isNaN(expiresMs) ? true : expiresMs > nowMs;
};

/** Milestones already reached at the current amount, in ascending threshold order. */
export const reachedMilestones = (boost: BoostEventContent): BoostMilestone[] =>
    [...boost.milestones]
        .sort((a, b) => a.atCents - b.atCents)
        .filter((m) => boost.currentCents >= m.atCents);
