/**
 * Mycelium constellation primitives.
 *
 * The federation map renders each known canopy as a node sized by
 * membership, with hyphae running between canopies that share active
 * relationships (member overlap, recent reactions, credit transfers).
 * For v1 the constellation is single-zoom and edge weighting is just
 * raw shared-membership count — richer signals (reactions, credits)
 * follow once notifications and treasury feeds are wired through.
 *
 * Pure layout lives here so it can be exercised with a single vitest
 * suite. Rendering is in `features/coalition/tabs/mycelium/MyceliumLayer.tsx`.
 */

export interface MyceliumNode {
    /** Stable id — usually a Matrix room/space id. */
    id: string;
    label: string;
    /** Member count; drives node radius. */
    memberCount: number;
}

export interface MyceliumEdge {
    /** Both ends point at MyceliumNode.id. */
    a: string;
    b: string;
    /**
     * Hyphal weight — higher = thicker, more opaque. v1 starts as the
     * number of rooms shared between the two canopies.
     */
    weight: number;
}

export interface MyceliumGraph {
    nodes: ReadonlyArray<MyceliumNode>;
    edges: ReadonlyArray<MyceliumEdge>;
}

export interface MyceliumLayoutNode extends MyceliumNode {
    /** Cartesian x in viewport coordinates. */
    x: number;
    /** Cartesian y in viewport coordinates. */
    y: number;
    /** Radius in viewport units. */
    radius: number;
}

export interface MyceliumLayoutOptions {
    /** Width and height of the layout box. */
    width?: number;
    height?: number;
    /** Min/max node radius. */
    minRadius?: number;
    maxRadius?: number;
}

/**
 * Radial placement: nodes laid out evenly around the centre on a ring
 * whose radius is 40% of min(width, height). The largest node sits at
 * angle 0 (right of centre) and the rest follow newest-first.
 *
 * Deliberately a static layout rather than a force-directed one — v1
 * trades organic motion for predictable rendering. A future version can
 * swap this for d3-force or react-spring without touching consumers.
 */
export function layoutMycelium(
    graph: MyceliumGraph,
    options: MyceliumLayoutOptions = {},
): MyceliumLayoutNode[] {
    const width = options.width ?? 480;
    const height = options.height ?? 360;
    const minRadius = options.minRadius ?? 6;
    const maxRadius = options.maxRadius ?? 22;
    const cx = width / 2;
    const cy = height / 2;
    const ringRadius = Math.min(width, height) * 0.4;

    const nodes = [...graph.nodes].sort((a, b) => b.memberCount - a.memberCount);
    if (nodes.length === 0) return [];

    const maxMembers = Math.max(1, ...nodes.map((n) => n.memberCount));

    return nodes.map((node, index) => {
        const angle = (2 * Math.PI * index) / nodes.length;
        const ratio = node.memberCount / maxMembers;
        const radius = minRadius + (maxRadius - minRadius) * ratio;
        // Special-case a single-node graph so it sits at the centre.
        if (nodes.length === 1) {
            return { ...node, x: cx, y: cy, radius };
        }
        return {
            ...node,
            x: cx + ringRadius * Math.cos(angle),
            y: cy + ringRadius * Math.sin(angle),
            radius,
        };
    });
}

/**
 * Computes the hyphal weight between two canopies as the number of
 * member ids they share. Useful when the caller has a quick map of
 * `canopyId -> Set<memberId>`.
 */
export function sharedMembershipWeight(
    a: ReadonlySet<string>,
    b: ReadonlySet<string>,
): number {
    let count = 0;
    for (const id of a) {
        if (b.has(id)) count += 1;
    }
    return count;
}
