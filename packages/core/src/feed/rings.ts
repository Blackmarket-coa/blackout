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

/** A feed entry, after both rings are merged. */
export interface FeedEntry<TSubject = unknown> {
    /** Stable across sources: `${source}:${subjectId}`. */
    key: string;
    ring: FeedRing;
    /** The moment this entered *this viewer's* feed — the only sort key. */
    at: string;
    subject: TSubject | null;
    /** The path that delivered it; empty for a Circle-authored post. */
    path: RelayPathLike | null;
    /** Other people who also relayed it, beyond the displayed path. */
    alsoRelayedBy: string[];
}

/** Structural mirror of `RelayPath`, kept local so this module stays standalone. */
export interface RelayPathLike {
    hops: { relayId: string; userId: string; note: string | null; active: boolean; at: string }[];
    originAuthorId: string | null;
    length: number;
}

/**
 * Merge the two rings into one chronological page.
 *
 * The sort key is `at`, descending, and nothing else. No score, no recency
 * blend, no interest boost, no per-source cap — the ordering carries no
 * editorial opinion, which is the whole point.
 *
 * Deduped by subject: when several people carried the same thing, the
 * **earliest** arrival is the one whose path is displayed, because that is the
 * relay that actually put it in front of this viewer. The rest are named in
 * `alsoRelayedBy` so nothing is hidden.
 */
export function mergeFeedEntries<T>(
    entries: readonly FeedEntry<T>[],
    limit: number
): FeedEntry<T>[] {
    const earliestByKey = new Map<string, FeedEntry<T>>();
    const extraRelayers = new Map<string, string[]>();

    for (const entry of entries) {
        const held = earliestByKey.get(entry.key);
        if (!held) {
            earliestByKey.set(entry.key, entry);
            continue;
        }
        const [keep, drop] = entry.at < held.at ? [entry, held] : [held, entry];
        earliestByKey.set(entry.key, keep);
        const relayer = drop.path?.hops[0]?.userId;
        if (relayer && relayer !== keep.path?.hops[0]?.userId) {
            const names = extraRelayers.get(entry.key) ?? [];
            if (!names.includes(relayer)) names.push(relayer);
            extraRelayers.set(entry.key, names);
        }
    }

    return [...earliestByKey.values()]
        .map((entry) => ({ ...entry, alsoRelayedBy: extraRelayers.get(entry.key) ?? [] }))
        .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.key.localeCompare(b.key)))
        .slice(0, limit);
}

/** A run of consecutive entries delivered by the same relayer. */
export interface FeedGroup<T> {
    /** The relayer whose run this is; null for Circle-authored entries. */
    relayerUserId: string | null;
    entries: FeedEntry<T>[];
}

/**
 * Fold consecutive entries from the same relayer into one expandable run
 * ("X relayed 6 things").
 *
 * This is the only flood control in the feed, and it is deliberately a
 * *presentation* change: order is preserved exactly, nothing is dropped,
 * downweighted or hidden, and expanding a run shows every entry. Reordering or
 * capping a prolific relayer would be ranking by another name.
 */
export function groupConsecutiveRelays<T>(entries: readonly FeedEntry<T>[]): FeedGroup<T>[] {
    const groups: FeedGroup<T>[] = [];
    for (const entry of entries) {
        const relayer = entry.path?.hops[0]?.userId ?? null;
        const tail = groups[groups.length - 1];
        if (tail && tail.relayerUserId === relayer && relayer !== null) tail.entries.push(entry);
        else groups.push({ relayerUserId: relayer, entries: [entry] });
    }
    return groups;
}
