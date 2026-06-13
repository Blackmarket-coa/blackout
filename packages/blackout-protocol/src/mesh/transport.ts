/**
 * Mesh transport seam (OSS-manifest group G6).
 *
 * `mergeMeshEnvelopes` defines *what* two nodes exchange; a transport defines
 * *how* the bytes move between them. This module gives the transport-agnostic
 * contract plus a pure, in-process loopback exchange used in tests. Real
 * transports (BLE, LoRa/Meshtastic bridge, local Wi-Fi) are device/hardware
 * bound and live outside this package — they drive exactly this same pairwise
 * exchange over their wire, so the routing logic is shared and tested here.
 */

import { mergeMeshEnvelopes, type MeshEnvelope } from './storeAndForward';

export type MeshNodeState = {
    nodeId: string;
    envelopes: MeshEnvelope[];
};

/**
 * A transport carries one node's offered envelopes to a peer and returns the
 * peer's offer back. Implementations: a loopback (below), or a hardware bridge
 * that serializes envelopes over BLE/LoRa/Wi-Fi.
 */
export interface MeshTransport {
    readonly localNodeId: string;
    readonly peerNodeId: string;
    exchange(offered: readonly MeshEnvelope[]): Promise<MeshEnvelope[]>;
}

export type GossipResult = {
    a: MeshNodeState;
    b: MeshNodeState;
    acceptedByA: number;
    acceptedByB: number;
};

/**
 * One bidirectional gossip round between two nodes' envelope sets. Pure: each
 * side merges the other's currently-held envelopes via the shared gossip rules
 * (hop/TTL bounds, seenBy dedup). Returns the updated states and how many
 * envelopes each side newly accepted. Repeated rounds converge (idempotent once
 * both sides have seen everything live).
 */
export const gossipExchange = (
    a: MeshNodeState,
    b: MeshNodeState,
    now: number = Date.now(),
): GossipResult => {
    const intoA = mergeMeshEnvelopes(a.envelopes, b.envelopes, {
        selfNodeId: a.nodeId,
        peerNodeId: b.nodeId,
        now,
    });
    const intoB = mergeMeshEnvelopes(b.envelopes, a.envelopes, {
        selfNodeId: b.nodeId,
        peerNodeId: a.nodeId,
        now,
    });
    return {
        a: { ...a, envelopes: intoA.merged },
        b: { ...b, envelopes: intoB.merged },
        acceptedByA: intoA.accepted.length,
        acceptedByB: intoB.accepted.length,
    };
};

/**
 * In-process loopback transport over a peer node's live envelope set. Useful
 * for tests and a single-process two-node demo; not a network transport.
 */
export const createLoopbackTransport = (
    localNodeId: string,
    peer: MeshNodeState,
    now: () => number = Date.now,
): MeshTransport => ({
    localNodeId,
    peerNodeId: peer.nodeId,
    async exchange(offered) {
        const merged = mergeMeshEnvelopes(peer.envelopes, offered, {
            selfNodeId: peer.nodeId,
            peerNodeId: localNodeId,
            now: now(),
        });
        peer.envelopes = merged.merged;
        // Offer back what this peer holds that the caller hasn't seen.
        return merged.merged.filter((e) => !e.seenBy.includes(localNodeId));
    },
});
