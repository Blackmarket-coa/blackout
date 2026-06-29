/**
 * Shouts — the unstructured intake valve of the Coliseum.
 *
 * A Shout is a video posted into the wind: no opponent, no structure. Other
 * users record Response Drops, which the crowd ranks. If the original shouter
 * replies to a Response Drop the exchange is bilateral, and the system offers to
 * formalize it into a full Match (see `graduateToMatch` in the service layer).
 */

import type { ColiseumArgumentMedia } from './citations';
import type { ColiseumTopicCategoryKey } from './taxonomy';
import { wilsonLowerBound } from './feed';

export interface ColiseumShout {
    id: string;
    authorId: string;
    domain?: ColiseumTopicCategoryKey;
    /** Short text framing alongside the video. */
    body?: string;
    media: ColiseumArgumentMedia;
    /** The Matrix room backing this shout's Den. */
    denRoomId?: string;
    createdAt: string;
    /** Recency × velocity heat, mirroring topic heat. */
    heat: number;
}

export interface ColiseumResponseDrop {
    id: string;
    shoutId: string;
    authorId: string;
    body?: string;
    media: ColiseumArgumentMedia;
    createdAt: string;
    /** Wilson lower bound on up/(up+down) — 0..1, for crowd ranking. */
    voteScore: number;
}

export interface ColiseumResponseDropVote {
    dropId: string;
    voterId: string;
    direction: 'up' | 'down';
    createdAt: string;
}

export interface RankedResponseDrop extends ColiseumResponseDrop {
    rank: number;
}

/** Recompute a drop's Wilson score from its up/down counts. */
export function responseDropVoteScore(up: number, down: number): number {
    return wilsonLowerBound(up, down);
}

/**
 * Rank Response Drops by crowd vote (Wilson lower bound), ties broken by
 * recency. The pile-on sorts itself by argument quality, not chronology.
 */
export function rankResponseDrops(
    drops: ReadonlyArray<ColiseumResponseDrop>
): RankedResponseDrop[] {
    return [...drops]
        .sort((a, b) => b.voteScore - a.voteScore || b.createdAt.localeCompare(a.createdAt))
        .map((drop, index) => ({ ...drop, rank: index + 1 }));
}

export interface BilateralExchange {
    shoutId: string;
    /** The Response Drop the original shouter replied to. */
    dropId: string;
    /** The shouter (red corner if it graduates) and the responder (blue corner). */
    shouterId: string;
    responderId: string;
}

/**
 * Detect a bilateral exchange: the original shouter has posted a Response Drop
 * of their own under a drop authored by someone else. That back-and-forth is the
 * trigger to prompt "This looks like a fight. Formalize into a Match?"
 *
 * Returns the most recent qualifying pairing, or null if none.
 */
export function detectBilateralExchange(
    shout: ColiseumShout,
    drops: ReadonlyArray<ColiseumResponseDrop>
): BilateralExchange | null {
    // Has the original shouter dropped a response of their own under this shout?
    const shouterDropped = drops.some((d) => d.authorId === shout.authorId);
    if (!shouterDropped) return null;

    // Find another author's drop — the responder the shouter is engaging.
    const otherDrops = [...drops]
        .filter((d) => d.authorId !== shout.authorId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const responderDrop = otherDrops[0];
    if (!responderDrop) return null;

    return {
        shoutId: shout.id,
        dropId: responderDrop.id,
        shouterId: shout.authorId,
        responderId: responderDrop.authorId,
    };
}
