import { describe, expect, it } from 'vitest';
import { mergeMeshEnvelopes, type MeshEnvelope } from '@blackout/protocol';

const NOW = Date.parse('2026-06-13T12:00:00.000Z');
const future = (mins: number) => new Date(NOW + mins * 60_000).toISOString();
const past = (mins: number) => new Date(NOW - mins * 60_000).toISOString();

const env = (over: Partial<MeshEnvelope> = {}): MeshEnvelope => ({
    id: over.id ?? 'm1',
    sender: '@a:server',
    recipient: '@b:server',
    payload: 'ciphertext',
    createdAt: past(1),
    expiresAt: future(60),
    hopCount: 0,
    maxHops: 8,
    seenBy: ['peerA'],
    ...over,
});

const merge = (local: MeshEnvelope[], incoming: MeshEnvelope[]) =>
    mergeMeshEnvelopes(local, incoming, { selfNodeId: 'self', peerNodeId: 'peerA', now: NOW });

describe('mergeMeshEnvelopes', () => {
    it('accepts a new envelope, increments hopCount, and records this node', () => {
        const { accepted, merged } = merge([], [env({ id: 'm1', hopCount: 2 })]);
        expect(accepted).toHaveLength(1);
        expect(accepted[0].hopCount).toBe(3);
        expect(accepted[0].seenBy).toContain('self');
        expect(merged).toHaveLength(1);
    });

    it('de-duplicates by id and unions seenBy instead of re-adding', () => {
        const local = [env({ id: 'm1', seenBy: ['self', 'peerA'] })];
        const { accepted, merged } = merge(local, [env({ id: 'm1', seenBy: ['peerB'] })]);
        expect(accepted).toHaveLength(0);
        expect(merged).toHaveLength(1);
        expect(merged[0].seenBy.sort()).toEqual(['peerA', 'peerB', 'self']);
    });

    it('drops expired incoming envelopes', () => {
        const { accepted, merged } = merge([], [env({ id: 'dead', expiresAt: past(5) })]);
        expect(accepted).toHaveLength(0);
        expect(merged).toHaveLength(0);
    });

    it('does not accept an envelope that would exceed maxHops', () => {
        const { accepted } = merge([], [env({ id: 'far', hopCount: 8, maxHops: 8 })]);
        expect(accepted).toHaveLength(0);
    });

    it('prunes already-expired local envelopes from the merged set', () => {
        const local = [env({ id: 'old', expiresAt: past(1) }), env({ id: 'live' })];
        const { merged } = merge(local, []);
        expect(merged.map((e) => e.id)).toEqual(['live']);
    });

    it('offers back only envelopes the peer has not seen', () => {
        const local = [
            env({ id: 'seen', seenBy: ['self', 'peerA'] }),
            env({ id: 'unseen', seenBy: ['self'] }),
        ];
        const { toForward } = merge(local, []);
        expect(toForward.map((e) => e.id)).toEqual(['unseen']);
    });
});
