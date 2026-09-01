/**
 * Pure relay-chain primitives for the Circle/Reach feed.
 *
 * The feed's central promise is that if something reached you, a human chain of
 * choices put it there — and that chain is always visible. That is only cheap
 * because a relay records *which edge the relayer saw it through*
 * (`parentRelayId`), so a path is a parent-pointer walk rather than a graph
 * search over the whole network.
 *
 * Kept dependency-light (no matrix-js-sdk, no React, no db) so it unit-tests
 * cleanly, mirroring `coliseum/feed.ts` and the client's `unifiedFeedModel.ts`.
 */

/**
 * Hard ceiling on how deep a relay chain may grow. The spec says distance is
 * unlimited *in principle* — and nothing here ranks or filters by depth — but an
 * unbounded parent walk is a denial-of-service surface, so writes past this
 * depth are refused. At 670 users a 64-hop chain is far beyond anything real.
 */
export const MAX_RELAY_CHAIN_DEPTH = 64;

/** The subset of a relay edge these pure helpers need. */
export interface RelayLink {
    id: string;
    relayerUserId: string;
    subjectSource: string;
    subjectId: string;
    parentRelayId: string | null;
    rootRelayId: string;
    chainDepth: number;
    originAuthorId: string | null;
    note: string | null;
    active: boolean;
    createdAt: string;
}

/** One rendered hop in a visible path. */
export interface RelayHop {
    relayId: string;
    userId: string;
    note: string | null;
    /**
     * False when this relayer has since withdrawn their relay. The hop is still
     * shown: a chain with a hole in it would misrepresent how the item actually
     * travelled. Downstream relays survive an ancestor's withdrawal because each
     * carries its own edge.
     */
    active: boolean;
    at: string;
}

/** A full path from the viewer inward to the original author. */
export interface RelayPath {
    /** Nearest relayer first, original relayer last. */
    hops: RelayHop[];
    /** The subject's author, when known — the far end of `[You] → … → [author]`. */
    originAuthorId: string | null;
    /** Hop count; equals `hops.length`. */
    length: number;
}

/**
 * Walk `parentRelayId` from `edge` up to the origin, nearest hop first.
 *
 * Terminates on three conditions: reaching an origin relay (null parent), a
 * dangling parent id (an edge whose parent was hard-deleted — tolerated rather
 * than thrown, so one bad row cannot take down a feed), or `MAX_RELAY_CHAIN_DEPTH`.
 * A parent must exist before its child is written, so the edge set is a DAG and
 * cycles are impossible; the `seen` guard is belt-and-braces against corrupt data
 * rather than an expected case.
 */
export function buildRelayPath(
    edge: RelayLink,
    edgesById: ReadonlyMap<string, RelayLink>
): RelayPath {
    const hops: RelayHop[] = [];
    const seen = new Set<string>();
    let current: RelayLink | undefined = edge;

    while (current && hops.length < MAX_RELAY_CHAIN_DEPTH) {
        if (seen.has(current.id)) break;
        seen.add(current.id);
        hops.push({
            relayId: current.id,
            userId: current.relayerUserId,
            note: current.note,
            active: current.active,
            at: current.createdAt,
        });
        if (current.parentRelayId === null) break;
        current = edgesById.get(current.parentRelayId);
    }

    return { hops, originAuthorId: edge.originAuthorId, length: hops.length };
}

/**
 * Depth for a new relay placed under `parent` (or 0 at the origin), and whether
 * the chain still has room. Callers must refuse the write when `withinLimit` is
 * false rather than silently truncating — a truncated chain would claim a
 * provenance that isn't true.
 */
export function nextChainDepth(parent: RelayLink | null): {
    depth: number;
    withinLimit: boolean;
} {
    const depth = parent === null ? 0 : parent.chainDepth + 1;
    return { depth, withinLimit: depth < MAX_RELAY_CHAIN_DEPTH };
}

/**
 * Every relay downstream of `rootEdgeIds` — the people your relays carried
 * something to, however many hops later. Breadth-first over child pointers,
 * bounded by `MAX_RELAY_CHAIN_DEPTH` levels.
 *
 * Inactive edges are traversed but a withdrawn relay still counts as having
 * carried the item: the people downstream really did receive it through you,
 * and un-relaying does not rewrite that history.
 */
export function collectDownstreamRelays(
    rootEdgeIds: readonly string[],
    edges: readonly RelayLink[]
): RelayLink[] {
    const childrenByParent = new Map<string, RelayLink[]>();
    for (const edge of edges) {
        if (edge.parentRelayId === null) continue;
        const siblings = childrenByParent.get(edge.parentRelayId);
        if (siblings) siblings.push(edge);
        else childrenByParent.set(edge.parentRelayId, [edge]);
    }

    const out: RelayLink[] = [];
    const seen = new Set<string>(rootEdgeIds);
    let frontier = [...rootEdgeIds];
    let level = 0;

    while (frontier.length > 0 && level < MAX_RELAY_CHAIN_DEPTH) {
        const next: string[] = [];
        for (const parentId of frontier) {
            for (const child of childrenByParent.get(parentId) ?? []) {
                if (seen.has(child.id)) continue;
                seen.add(child.id);
                out.push(child);
                next.push(child.id);
            }
        }
        frontier = next;
        level += 1;
    }
    return out;
}
