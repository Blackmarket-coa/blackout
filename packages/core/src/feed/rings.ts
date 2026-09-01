/**
 * The two rings, and the honest arithmetic behind the Illumination meter.
 *
 * Circle — the people you follow. Their posts are in your feed by default.
 * Reach  — everything relayed inward from beyond your Circle. Distance is
 *          unlimited in principle, but travel only ever happens because a real
 *          person chose to relay, so there is no ranking here and no injection:
 *          an item is either carried by a human edge or it is not in your feed.
 */
import { collectDownstreamRelays, type RelayLink } from './relayChain';

export type FeedRing = 'circle' | 'reach';

/**
 * Which ring delivered an item: `circle` when its author is someone you follow,
 * `reach` when it arrived through a relay. Authorship wins — a post by someone
 * in your Circle is a Circle item even if a relay also carried it, because the
 * honest answer to "why am I seeing this" is "you follow them".
 */
export function ringForItem(input: {
    authorId: string | null;
    circle: ReadonlySet<string>;
}): FeedRing {
    return input.authorId !== null && input.circle.has(input.authorId) ? 'circle' : 'reach';
}

export interface IlluminationInput {
    /** People this user follows. */
    following: readonly string[];
    /** People who follow this user. */
    followers: readonly string[];
    /** This user's own relay edges. */
    ownRelays: readonly RelayLink[];
    /** Every relay edge in play — used to walk downstream from `ownRelays`. */
    allRelays: readonly RelayLink[];
    /** Total accounts on the network, the denominator for `unlit`. */
    networkSize: number;
}

/**
 * How much of the network this person's presence currently lights up.
 *
 * "Lit" is the set of distinct people actually connected to them: their Circle,
 * the people who hold them in theirs, and everyone downstream of a relay they
 * made. `unlit` is the remainder, and it is returned explicitly rather than
 * omitted — the spec's whole point is that unlit areas are shown as unlit, which
 * is the honest nudge to connect. Grows only as real connections grow; there is
 * nothing here to game.
 */
export function computeIllumination(input: IlluminationInput): {
    circleSize: number;
    heldByCount: number;
    overlapCount: number;
    relayedCount: number;
    downstreamCount: number;
    litCount: number;
    unlitCount: number;
    networkSize: number;
} {
    const following = new Set(input.following);
    const followers = new Set(input.followers);

    let overlapCount = 0;
    for (const id of followers) if (following.has(id)) overlapCount += 1;

    const downstream = collectDownstreamRelays(
        input.ownRelays.map((e) => e.id),
        input.allRelays
    );
    const downstreamPeople = new Set(downstream.map((e) => e.relayerUserId));

    const lit = new Set<string>([...following, ...followers, ...downstreamPeople]);

    return {
        circleSize: following.size,
        heldByCount: followers.size,
        overlapCount,
        relayedCount: input.ownRelays.length,
        downstreamCount: downstreamPeople.size,
        litCount: lit.size,
        // A brand-new account lights nothing, and the meter says so rather than
        // rounding up. Clamped because networkSize is a snapshot that can lag.
        unlitCount: Math.max(0, input.networkSize - lit.size),
        networkSize: input.networkSize,
    };
}
