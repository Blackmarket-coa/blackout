/**
 * Store-and-forward gossip primitives for mesh / offline transport
 * (OSS-manifest group G6). First-party greenfield — no Briar/Bramble code
 * (GPLv3, reference-only). Pure and side-effect-free so both the client and
 * the server relay node share one well-tested implementation.
 *
 * The model is epidemic store-and-forward: each node holds a bounded set of
 * opaque envelopes and, when it meets a peer, exchanges the ones the peer
 * hasn't seen. Envelopes are end-to-end encrypted upstream — no node here ever
 * inspects `payload`. Routing is bounded by a TTL (`expiresAt`) and a hop cap
 * (`maxHops`); `seenBy` tracks which node ids have held an envelope so a peer
 * is never re-offered something it already carries.
 */

export type MeshEnvelope = {
    /** Globally-unique message id (assigned by the originator). */
    id: string;
    sender: string;
    recipient: string;
    /** Opaque end-to-end-encrypted payload; never inspected by relays. */
    payload: string;
    createdAt: string;
    /** ISO 8601 hard expiry; envelopes past this are dropped everywhere. */
    expiresAt: string;
    /** Hops travelled so far. */
    hopCount: number;
    /** Maximum hops before the envelope stops propagating. */
    maxHops: number;
    /** Node ids that have held this envelope (epidemic-routing dedup). */
    seenBy: string[];
};

export type MeshMergeOptions = {
    /** This node's id; recorded in `seenBy` on every accepted envelope. */
    selfNodeId: string;
    /** The peer we synced with; used to compute what to offer back. */
    peerNodeId: string;
    /** Current time in epoch ms (injectable for deterministic tests). */
    now: number;
};

export type MeshMergeResult = {
    /** The node's envelope set after the merge (expired entries pruned). */
    merged: MeshEnvelope[];
    /** Envelopes newly accepted from the peer this round. */
    accepted: MeshEnvelope[];
    /** Envelopes to offer back to the peer (it hasn't seen them yet). */
    toForward: MeshEnvelope[];
};

const isLive = (env: MeshEnvelope, now: number): boolean => {
    const expiry = Date.parse(env.expiresAt);
    if (Number.isNaN(expiry) || expiry <= now) return false;
    return env.hopCount <= env.maxHops;
};

const union = (...lists: string[][]): string[] => Array.from(new Set(lists.flat()));

/**
 * Merge a peer's offered envelopes into the local set and compute what to send
 * back. Accepting an envelope increments its hop count (it travelled one hop to
 * reach us) and records this node in `seenBy`; envelopes that would exceed
 * `maxHops` or are expired are not accepted. Envelopes already held have their
 * `seenBy` unioned so routing knowledge converges without duplication.
 */
export const mergeMeshEnvelopes = (
    local: readonly MeshEnvelope[],
    incoming: readonly MeshEnvelope[],
    options: MeshMergeOptions,
): MeshMergeResult => {
    const { selfNodeId, peerNodeId, now } = options;
    const byId = new Map<string, MeshEnvelope>();
    for (const env of local) byId.set(env.id, env);

    const accepted: MeshEnvelope[] = [];

    for (const inc of incoming) {
        if (!isLive(inc, now)) continue;
        const existing = byId.get(inc.id);
        if (existing) {
            byId.set(inc.id, {
                ...existing,
                seenBy: union(existing.seenBy, inc.seenBy, [selfNodeId]),
            });
            continue;
        }
        const relayed: MeshEnvelope = {
            ...inc,
            hopCount: inc.hopCount + 1,
            seenBy: union(inc.seenBy, [selfNodeId]),
        };
        if (relayed.hopCount > relayed.maxHops) continue;
        byId.set(relayed.id, relayed);
        accepted.push(relayed);
    }

    // Prune anything that has since expired (or arrived expired and was held).
    const merged: MeshEnvelope[] = [];
    for (const env of byId.values()) {
        if (isLive(env, now)) merged.push(env);
    }

    const toForward = merged.filter((env) => !env.seenBy.includes(peerNodeId));

    return { merged, accepted, toForward };
};

/** Stamp this node onto an envelope before offering it to a peer. */
export const markSeenBy = (env: MeshEnvelope, nodeId: string): MeshEnvelope =>
    env.seenBy.includes(nodeId) ? env : { ...env, seenBy: [...env.seenBy, nodeId] };
