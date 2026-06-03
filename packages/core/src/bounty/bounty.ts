/**
 * Unified bounty board. A bounty is a unit of work posted to the ecosystem —
 * "Creator needed", "Tester needed", "Coalition builder needed" — that someone
 * can claim and complete for a reward. The same engine powers both the Blackout
 * home board (creator / coalition / developer / tester / content work) and the
 * FBM home board (producer / vendor / product / sponsorship work); the two
 * surfaces differ only in which categories they present, not in the model.
 *
 * Intentionally simple for the first slice: a card that moves through a small
 * status lifecycle and carries a human-readable reward summary. Settlement and
 * payout (cash, revenue share, product tokens) live in FBM and are out of scope
 * here — the bounty only records the reward terms.
 */

export const BOUNTY_CATEGORIES = [
    'creator',
    'coalition',
    'developer',
    'tester',
    'content',
] as const;
export type BountyCategory = (typeof BOUNTY_CATEGORIES)[number];

export const BOUNTY_REWARD_TYPES = [
    'cash',
    'revenue_share',
    'product_token',
    'store_credit',
    'digital_product',
] as const;
export type BountyRewardType = (typeof BOUNTY_REWARD_TYPES)[number];

export const BOUNTY_STATUSES = [
    'open',
    'claimed',
    'in_review',
    'completed',
    'closed',
] as const;
export type BountyStatus = (typeof BOUNTY_STATUSES)[number];

/**
 * Producer ↔ creator matching lives inside the bounty system: a creator applies
 * to an open bounty, and the poster accepts one applicant (which claims the
 * bounty and declines the rest). Applications are the backbone of both manual
 * application and future auto-matching.
 */
export const BOUNTY_APPLICATION_STATUSES = [
    'pending',
    'accepted',
    'declined',
    'withdrawn',
] as const;
export type BountyApplicationStatus = (typeof BOUNTY_APPLICATION_STATUSES)[number];

export interface BountyApplication {
    id: string;
    bountyId: string;
    /** User id (MXID/sub) of the applying creator. */
    applicantId: string;
    /** Optional pitch from the applicant. */
    message?: string;
    status: BountyApplicationStatus;
    createdAt: string;
    updatedAt: string;
}

export function isBountyApplicationStatus(value: unknown): value is BountyApplicationStatus {
    return (
        typeof value === 'string' &&
        (BOUNTY_APPLICATION_STATUSES as readonly string[]).includes(value)
    );
}

export interface Bounty {
    id: string;
    category: BountyCategory;
    title: string;
    description: string;
    /** User id (MXID/sub) of the poster. */
    creatorId: string;
    rewardType: BountyRewardType;
    /** Human-readable reward, e.g. "$50", "10% rev-share", "1 premium theme". */
    rewardSummary: string;
    /** Optional structured amount for cash / store-credit rewards. */
    rewardAmountCents?: number;
    requirements: string[];
    deliverables: string[];
    status: BountyStatus;
    /** Optional link to the coalition this bounty belongs to. */
    coalitionId?: string;
    /** User id of whoever claimed it, once claimed. */
    claimedBy?: string;
    createdAt: string;
    updatedAt: string;
}

export function isBountyCategory(value: unknown): value is BountyCategory {
    return (
        typeof value === 'string' && (BOUNTY_CATEGORIES as readonly string[]).includes(value)
    );
}

export function isBountyStatus(value: unknown): value is BountyStatus {
    return typeof value === 'string' && (BOUNTY_STATUSES as readonly string[]).includes(value);
}

/** Categories most relevant to creators, highest-priority first, for auto-matching. */
export const CREATOR_RELEVANT_CATEGORIES: readonly BountyCategory[] = [
    'creator',
    'content',
    'coalition',
];

export interface RecommendBountiesInput {
    /** Candidate bounties (typically all open ones). */
    open: readonly Bounty[];
    /** The creator the recommendations are for; their own posts are excluded. */
    viewerId: string;
    /** Bounty ids the viewer has already applied to; excluded. */
    appliedBountyIds: ReadonlySet<string> | readonly string[];
    /** Optional category preferences; defaults to creator-relevant categories. */
    preferredCategories?: readonly BountyCategory[];
    limit?: number;
}

/**
 * Auto-matching v1: recommend open bounties to a creator. Pure and deterministic
 * so it is trivially testable. Excludes the viewer's own posts and anything they
 * already applied to, then ranks preferred/creator-relevant categories first,
 * breaking ties by most-recent. Heuristic by design — richer signals (niches,
 * audience, past campaigns) layer on later without changing the contract.
 */
export function recommendBounties(input: RecommendBountiesInput): Bounty[] {
    const applied =
        input.appliedBountyIds instanceof Set
            ? input.appliedBountyIds
            : new Set(input.appliedBountyIds);
    const preferred = new Set(input.preferredCategories ?? CREATOR_RELEVANT_CATEGORIES);
    const candidates = input.open.filter(
        (b) => b.status === 'open' && b.creatorId !== input.viewerId && !applied.has(b.id),
    );
    const score = (b: Bounty): number => {
        let s = 0;
        if (preferred.has(b.category)) s += 10;
        const idx = CREATOR_RELEVANT_CATEGORIES.indexOf(b.category);
        if (idx >= 0) s += CREATOR_RELEVANT_CATEGORIES.length - idx;
        return s;
    };
    return [...candidates]
        .sort(
            (a, b) =>
                score(b) - score(a) || Date.parse(b.createdAt) - Date.parse(a.createdAt),
        )
        .slice(0, input.limit ?? 20);
}

/** Group bounties by category, preserving input order within each category. */
export function groupBountiesByCategory(
    bounties: readonly Bounty[],
): Record<BountyCategory, Bounty[]> {
    const groups = Object.fromEntries(BOUNTY_CATEGORIES.map((c) => [c, [] as Bounty[]])) as Record<
        BountyCategory,
        Bounty[]
    >;
    for (const bounty of bounties) {
        groups[bounty.category].push(bounty);
    }
    return groups;
}
