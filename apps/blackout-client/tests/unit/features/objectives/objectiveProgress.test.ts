import { describe, expect, it } from 'vitest';
import {
    aggregateObjectiveProgress,
    type ObjectiveProgressContribution,
} from '@blackout/core';
import {
    OBJECTIVE_STATUSES,
    isDenObjectiveContributionPayload,
    isDenObjectivePayload,
    type DenObjectivePayload,
} from '@blackout/protocol';

const contribution = (
    contributorId: string,
    amount: number,
): ObjectiveProgressContribution => ({ contributorId, amount });

describe('aggregateObjectiveProgress', () => {
    it('sums positive contributions and clamps percent to 0–100', () => {
        const result = aggregateObjectiveProgress(40, [
            contribution('@a:x', 10),
            contribution('@b:x', 15),
        ]);
        expect(result.current).toBe(25);
        expect(result.target).toBe(40);
        expect(result.percent).toBe(63); // round(25/40*100)
        expect(result.met).toBe(false);
    });

    it('caps percent at 100 once the target is exceeded and flips `met`', () => {
        const result = aggregateObjectiveProgress(10, [
            contribution('@a:x', 8),
            contribution('@a:x', 8),
        ]);
        expect(result.current).toBe(16);
        expect(result.percent).toBe(100);
        expect(result.met).toBe(true);
    });

    it('counts DISTINCT contributors, not contributions', () => {
        const result = aggregateObjectiveProgress(100, [
            contribution('@a:x', 1),
            contribution('@a:x', 1),
            contribution('@a:x', 1),
            contribution('@b:x', 1),
        ]);
        expect(result.contributorCount).toBe(2);
        expect(result.current).toBe(4);
    });

    it('ignores non-positive and non-finite amounts', () => {
        const result = aggregateObjectiveProgress(10, [
            contribution('@a:x', -5),
            contribution('@b:x', 0),
            contribution('@c:x', Number.NaN),
            contribution('@d:x', 3),
        ]);
        expect(result.current).toBe(3);
        expect(result.contributorCount).toBe(1);
    });

    it('treats a non-positive target as ungoaled (percent 0, never met)', () => {
        const result = aggregateObjectiveProgress(0, [contribution('@a:x', 5)]);
        expect(result.percent).toBe(0);
        expect(result.met).toBe(false);
        expect(result.target).toBe(0);
    });

    it('GUARDRAIL: exposes only aggregate fields — no per-contributor data', () => {
        const result = aggregateObjectiveProgress(10, [
            contribution('@alice:x', 4),
            contribution('@bob:x', 4),
        ]);
        // The shape must never leak identities or a ranking. Assert the exact key set.
        expect(Object.keys(result).sort()).toEqual(
            ['contributorCount', 'current', 'met', 'percent', 'target'].sort(),
        );
        const serialized = JSON.stringify(result);
        expect(serialized).not.toContain('@alice:x');
        expect(serialized).not.toContain('@bob:x');
    });
});

describe('objective protocol guards', () => {
    const valid: DenObjectivePayload = {
        objectiveId: 'obj-1',
        title: 'Log mutual-aid hours',
        unit: 'hours',
        target: 40,
        status: 'active',
        createdAt: '2026-06-24T00:00:00.000Z',
    };

    it('accepts a well-formed objective payload', () => {
        expect(isDenObjectivePayload(valid)).toBe(true);
    });

    it('rejects objectives with a non-positive target', () => {
        expect(isDenObjectivePayload({ ...valid, target: 0 })).toBe(false);
        expect(isDenObjectivePayload({ ...valid, target: -1 })).toBe(false);
    });

    it('rejects objectives with an unknown status', () => {
        expect(isDenObjectivePayload({ ...valid, status: 'paused' })).toBe(false);
    });

    it('only knows the three intended statuses', () => {
        expect([...OBJECTIVE_STATUSES].sort()).toEqual(['active', 'archived', 'met']);
    });

    it('validates contribution payloads (positive amount required)', () => {
        expect(isDenObjectiveContributionPayload({ objectiveId: 'obj-1', amount: 2 })).toBe(true);
        expect(isDenObjectiveContributionPayload({ objectiveId: 'obj-1', amount: 0 })).toBe(false);
        expect(isDenObjectiveContributionPayload({ objectiveId: 'obj-1' })).toBe(false);
        expect(isDenObjectiveContributionPayload({ amount: 2 })).toBe(false);
    });
});
