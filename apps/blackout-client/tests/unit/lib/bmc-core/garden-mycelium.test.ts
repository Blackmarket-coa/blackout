import { describe, expect, it } from 'vitest';
import {
    layoutMycelium,
    sharedMembershipWeight,
    type MyceliumGraph,
} from '../../../../src/lib/bmc-core/mycelium';
import { __test as gardenTest } from '../../../../src/app/features/governance/GardenView';

const { parseBalance, bedKind } = gardenTest;

describe('GardenView.parseBalance', () => {
    it('parses numeric strings as non-negative floats', () => {
        expect(parseBalance('123.45')).toBeCloseTo(123.45);
        expect(parseBalance('0')).toBe(0);
    });

    it('falls back to 0 for malformed input', () => {
        expect(parseBalance(undefined)).toBe(0);
        expect(parseBalance('nope')).toBe(0);
        expect(parseBalance('-5')).toBe(0);
        expect(parseBalance('NaN')).toBe(0);
    });
});

describe('GardenView.bedKind', () => {
    it('returns fallow when the balance is zero', () => {
        expect(bedKind(0, 100)).toBe('fallow');
    });

    it('returns fallow when the max is zero (no treasury yet)', () => {
        expect(bedKind(5, 0)).toBe('fallow');
    });

    it('returns full at >= 66% of the max', () => {
        expect(bedKind(80, 100)).toBe('full');
        expect(bedKind(66, 100)).toBe('full');
    });

    it('returns sprouting between 10% and 65%', () => {
        expect(bedKind(50, 100)).toBe('sprouting');
        expect(bedKind(10, 100)).toBe('sprouting');
    });

    it('returns fallow below 10%', () => {
        expect(bedKind(5, 100)).toBe('fallow');
    });
});

describe('layoutMycelium', () => {
    const graph = (nodes: number): MyceliumGraph => ({
        nodes: Array.from({ length: nodes }, (_, i) => ({
            id: `canopy-${i}`,
            label: `Canopy ${i}`,
            memberCount: 10 + i,
        })),
        edges: [],
    });

    it('returns no positions for an empty graph', () => {
        expect(layoutMycelium({ nodes: [], edges: [] })).toEqual([]);
    });

    it('centres a single-node graph', () => {
        const result = layoutMycelium(graph(1), { width: 200, height: 100 });
        expect(result[0]?.x).toBe(100);
        expect(result[0]?.y).toBe(50);
    });

    it('distributes multiple nodes evenly around the centre', () => {
        const result = layoutMycelium(graph(4), { width: 480, height: 360 });
        expect(result.length).toBe(4);
        // x coordinates should be symmetric around 240.
        const xs = result.map((n) => Math.round(n.x));
        expect(xs).toContain(240);
    });

    it('sizes node radius by membership relative to max', () => {
        const result = layoutMycelium(graph(3));
        const sorted = [...result].sort((a, b) => b.memberCount - a.memberCount);
        expect(sorted[0].radius).toBeGreaterThanOrEqual(sorted[1].radius);
    });
});

describe('sharedMembershipWeight', () => {
    it('counts intersection size between two member sets', () => {
        const a = new Set(['@alice:x', '@bob:x', '@carol:x']);
        const b = new Set(['@bob:x', '@carol:x', '@dave:x']);
        expect(sharedMembershipWeight(a, b)).toBe(2);
    });

    it('returns 0 when there is no overlap', () => {
        expect(sharedMembershipWeight(new Set(['@a']), new Set(['@b']))).toBe(0);
    });
});
