/**
 * Pure view helpers for the Circle & Reach feed.
 *
 * Deliberately does no sorting, ranking, filtering or merging: the server
 * already decided what is in the feed and in what order, and re-deciding here
 * would quietly reintroduce the client-side ranking this feed exists to remove.
 * Everything below is presentation only.
 *
 * Kept free of React and matrix-js-sdk so it unit-tests cleanly, mirroring
 * `features/home/unifiedFeedModel.ts`.
 */
import type { CircleFeedItem, RelayHopView } from './circleFeedClient';

/** How a hop is labelled in a path. */
export interface RelayPathLabel {
    userId: string;
    /** True for the viewer's own hop, rendered as "You". */
    isViewer: boolean;
    active: boolean;
    note: string | null;
}

/**
 * Turn a delivered path into the labels rendered as `[You] → [X] → [Y]`.
 *
 * Order runs outward-to-inward — the viewer first, then each relayer in the
 * order the item travelled, ending at whoever relayed from the origin. The
 * stored path is nearest-first, so it is reversed here only for reading order;
 * no hop is dropped, including withdrawn ones, because a chain with a hole in
 * it would misrepresent how the item actually arrived.
 */
export function relayPathLabels(
    hops: readonly RelayHopView[],
    viewerId: string | null
): RelayPathLabel[] {
    const labels: RelayPathLabel[] = [
        { userId: viewerId ?? 'you', isViewer: true, active: true, note: null },
    ];
    for (const hop of hops) {
        labels.push({
            userId: hop.userId,
            isViewer: viewerId !== null && hop.userId === viewerId,
            active: hop.active,
            note: hop.note,
        });
    }
    return labels;
}

/** `You → alice → bob` — the compact form shown on a card. */
export function formatRelayPath(
    labels: readonly RelayPathLabel[],
    displayNameFor: (userId: string) => string
): string {
    return labels
        .map((label) => (label.isViewer ? 'You' : displayNameFor(label.userId)))
        .join(' → ');
}

/**
 * Why this item is in the feed, in plain words. Every item has an answer —
 * that is the point of the feed — so this never returns a vague fallback.
 */
export function provenanceSummary(
    item: CircleFeedItem,
    displayNameFor: (userId: string) => string
): string {
    if (item.ring === 'circle') {
        const author = item.subject?.authorId;
        return author
            ? `${displayNameFor(author)} posted this`
            : 'Posted by someone in your Circle';
    }
    const nearest = item.path?.hops[0];
    if (!nearest) return 'Relayed into your Reach';
    const extra = item.alsoRelayedBy.length;
    const base = `${displayNameFor(nearest.userId)} relayed this`;
    return extra > 0 ? `${base}, and ${extra} other${extra === 1 ? '' : 's'}` : base;
}

/** A run of consecutive items carried by the same relayer. */
export interface CircleFeedGroup {
    /** The relayer whose run this is; null for Circle-authored items. */
    relayerUserId: string | null;
    items: CircleFeedItem[];
}

/**
 * Fold consecutive items from one relayer into a single expandable run.
 *
 * The only flood control in the feed, and deliberately presentational: order is
 * preserved exactly, nothing is dropped, downweighted or hidden, and expanding a
 * run shows every item. Reordering or capping a prolific relayer would be
 * ranking by another name.
 */
export function groupConsecutive(items: readonly CircleFeedItem[]): CircleFeedGroup[] {
    const groups: CircleFeedGroup[] = [];
    for (const item of items) {
        const relayer = item.path?.hops[0]?.userId ?? null;
        const tail = groups[groups.length - 1];
        if (tail && relayer !== null && tail.relayerUserId === relayer) tail.items.push(item);
        else groups.push({ relayerUserId: relayer, items: [item] });
    }
    return groups;
}

/** Runs worth collapsing behind one line. Below this they just render inline. */
export const RUN_COLLAPSE_THRESHOLD = 3;

export const shouldCollapse = (group: CircleFeedGroup): boolean =>
    group.relayerUserId !== null && group.items.length >= RUN_COLLAPSE_THRESHOLD;

/**
 * Why the feed is empty, said plainly.
 *
 * An empty feed is the honest result of a Circle nobody has filled yet, not a
 * failure — so the copy points at Discover rather than apologising or implying
 * something went wrong.
 */
export function emptyFeedReason(circleSize: number): string {
    return circleSize === 0
        ? 'Your Circle is empty. Nothing reaches you until you follow someone — find people in Discover.'
        : 'Nobody in your Circle has posted or relayed anything yet. When they do, it lands here.';
}
