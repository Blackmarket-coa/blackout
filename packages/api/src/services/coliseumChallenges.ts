import {
    rankChallengeEntries,
    type ChallengeEntry,
    type ColiseumChallenge,
    type RankedChallengeEntry,
} from '@blackout/core';
import { db } from '../db/store';

const rand = () => `${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;

export function newChallengeId(): string {
    return `chal_${rand()}`;
}
export function newEntryId(): string {
    return `cent_${rand()}`;
}
export function newVoteId(): string {
    return `cvote_${rand()}`;
}

export function listChallenges(
    filter: { status?: ColiseumChallenge['status'] } = {}
): ColiseumChallenge[] {
    return db.listColiseumChallenges(filter);
}

export function getChallenge(id: string): ColiseumChallenge | null {
    return db.getColiseumChallenge(id) ?? null;
}

export function createChallenge(
    input: Parameters<typeof db.createColiseumChallenge>[0]
): ColiseumChallenge {
    return db.createColiseumChallenge(input);
}

export function updateChallengeStatus(
    id: string,
    status: ColiseumChallenge['status']
): ColiseumChallenge | null {
    return db.updateColiseumChallengeStatus(id, status) ?? null;
}

/**
 * Ranked entries (by vote count) for a challenge's detail/results view.
 *
 * Still walks the vote map once — votes are keyed by their own id, not by
 * entry, so there is no index to hit — but it does so with a single pass and a
 * set membership check rather than a filter per entry.
 */
export function listRankedEntries(challengeId: string): RankedChallengeEntry[] {
    const entries = db.listChallengeEntries({ challengeId });
    const entryIds = new Set(entries.map((entry) => entry.id));
    const votes = db.listChallengeVotes({}).filter((vote) => entryIds.has(vote.entryId));
    return rankChallengeEntries(entries, votes);
}

export function createEntry(input: Parameters<typeof db.createChallengeEntry>[0]): ChallengeEntry {
    return db.createChallengeEntry(input);
}

/** Keyed lookup. This used to scan every entry in the store to find one. */
export function getEntry(entryId: string): ChallengeEntry | null {
    return db.getChallengeEntry(entryId) ?? null;
}

/**
 * Attach the canopy den backing an entry's discussion.
 *
 * Same contract as `linkTopicDiscussionDen`: the den is created client-side and
 * lazily, and the first link wins, so two people commenting at once cannot
 * leave the entry with two rival discussions.
 *
 * Returns null when the entry does not exist.
 */
export function linkEntryDiscussionDen(
    entryId: string,
    discussionDenId: string
): { entry: ChallengeEntry; created: boolean } | null {
    const entry = db.getChallengeEntry(entryId);
    if (!entry) return null;
    if (entry.discussionDenId) {
        return { entry, created: false };
    }
    const updated = db.upsertChallengeEntry({ ...entry, discussionDenId });
    return { entry: updated, created: true };
}

export function voteForEntry(entryId: string, voterId: string): void {
    db.addChallengeVote({ id: newVoteId(), entryId, voterId });
}

/** Entry count for a challenge — drives the challenges leaderboard. */
export function entryCount(challengeId: string): number {
    return db.listChallengeEntries({ challengeId }).length;
}
