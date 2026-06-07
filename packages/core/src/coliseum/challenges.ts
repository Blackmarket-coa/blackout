/**
 * Coliseum Challenges. A community challenge — "start a business", "grow food",
 * "build a project" — that members enter and the community votes on. Modeled on
 * the same small-record + status-lifecycle convention as ColiseumTopic so it
 * persists through the write-behind store.
 */

export const CHALLENGE_STATUSES = ['open', 'judging', 'closed'] as const;
export type ChallengeStatus = (typeof CHALLENGE_STATUSES)[number];

/** Suggested categories for UI affordances; the stored value is free-text. */
export const SUGGESTED_CHALLENGE_CATEGORIES = [
    'business',
    'grow_food',
    'build_project',
    'other',
] as const;

export interface ColiseumChallenge {
    id: string;
    title: string;
    description?: string;
    /** Free-text category (business, grow_food, build_project, …). */
    category: string;
    status: ChallengeStatus;
    creatorId: string;
    createdAt: string;
    updatedAt: string;
}

export interface ChallengeEntry {
    id: string;
    challengeId: string;
    entrantId: string;
    title: string;
    body?: string;
    /** Optional mxc:// or https URL for an entry's media (photo/video). */
    mediaUrl?: string;
    createdAt: string;
}

/** One vote per voter per entry. */
export interface ChallengeVote {
    id: string;
    entryId: string;
    voterId: string;
    createdAt: string;
}

export interface RankedChallengeEntry extends ChallengeEntry {
    votes: number;
    rank: number;
}

export function isChallengeStatus(value: unknown): value is ChallengeStatus {
    return typeof value === 'string' && (CHALLENGE_STATUSES as readonly string[]).includes(value);
}

/** Rank entries by vote count (descending), ties broken by recency. */
export function rankChallengeEntries(
    entries: readonly ChallengeEntry[],
    votes: readonly ChallengeVote[],
): RankedChallengeEntry[] {
    const counts = new Map<string, number>();
    for (const vote of votes) counts.set(vote.entryId, (counts.get(vote.entryId) ?? 0) + 1);
    return entries
        .map((entry) => ({ ...entry, votes: counts.get(entry.id) ?? 0, rank: 0 }))
        .sort((a, b) => b.votes - a.votes || b.createdAt.localeCompare(a.createdAt))
        .map((entry, index) => ({ ...entry, rank: index + 1 }));
}
