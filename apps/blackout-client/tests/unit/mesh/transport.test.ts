import { describe, expect, it } from 'vitest';
import {
    createLoopbackTransport,
    gossipExchange,
    type MeshEnvelope,
    type MeshNodeState,
} from '@blackout/protocol';

const NOW = Date.parse('2026-06-13T12:00:00.000Z');
const future = (mins: number) => new Date(NOW + mins * 60_000).toISOString();

const env = (id: string, origin: string): MeshEnvelope => ({
    id,
    sender: '@a:server',
    recipient: '@b:server',
    payload: 'ciphertext',
    createdAt: new Date(NOW).toISOString(),
    expiresAt: future(60),
    hopCount: 0,
    maxHops: 8,
    seenBy: [origin],
});

describe('gossipExchange', () => {
    it('propagates an envelope from one node to the other and converges', () => {
        let a: MeshNodeState = { nodeId: 'A', envelopes: [env('m1', 'A')] };
        let b: MeshNodeState = { nodeId: 'B', envelopes: [] };

        const round1 = gossipExchange(a, b, NOW);
        expect(round1.acceptedByB).toBe(1);
        expect(round1.b.envelopes.map((e) => e.id)).toEqual(['m1']);

        // A second round is idempotent — B already holds m1 (seenBy includes B).
        const round2 = gossipExchange(round1.a, round1.b, NOW);
        expect(round2.acceptedByB).toBe(0);
        expect(round2.acceptedByA).toBe(0);
    });

    it('merges disjoint envelopes both ways in a single round', () => {
        const a: MeshNodeState = { nodeId: 'A', envelopes: [env('m1', 'A')] };
        const b: MeshNodeState = { nodeId: 'B', envelopes: [env('m2', 'B')] };
        const r = gossipExchange(a, b, NOW);
        expect(r.a.envelopes.map((e) => e.id).sort()).toEqual(['m1', 'm2']);
        expect(r.b.envelopes.map((e) => e.id).sort()).toEqual(['m1', 'm2']);
    });
});

describe('createLoopbackTransport', () => {
    it('delivers offered envelopes into the peer and returns what the caller lacks', async () => {
        const peer: MeshNodeState = { nodeId: 'B', envelopes: [env('m2', 'B')] };
        const transport = createLoopbackTransport('A', peer, () => NOW);

        const back = await transport.exchange([env('m1', 'A')]);
        // Peer now holds both; it offers back m2 (A hasn't seen it).
        expect(peer.envelopes.map((e) => e.id).sort()).toEqual(['m1', 'm2']);
        expect(back.map((e) => e.id)).toEqual(['m2']);
        expect(transport.peerNodeId).toBe('B');
    });
});
