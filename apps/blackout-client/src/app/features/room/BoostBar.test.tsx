import { describe, it, expect } from 'vitest';
import { isBoostEventContent, isBoostActive, reachedMilestones } from '@blackout/protocol';

const boost = {
    schemaVersion: 1,
    boostId: 'b_1',
    type: 'hype_train' as const,
    goalCents: 500000,
    currentCents: 120000,
    currency: 'USD',
    milestones: [
        { atCents: 50000, reward: 'L1' },
        { atCents: 100000, reward: 'L2' },
        { atCents: 250000, reward: 'L3' },
    ],
    startedAt: '2026-01-01T00:00:00Z',
    expiresAt: '2999-01-01T00:00:00Z',
    status: 'active' as const,
};

describe('boost contract helpers', () => {
    it('validates a well-formed boost', () => {
        expect(isBoostEventContent(boost)).toBe(true);
    });

    it('rejects a boost with a zero goal', () => {
        expect(isBoostEventContent({ ...boost, goalCents: 0 })).toBe(false);
    });

    it('treats an unexpired active boost as active', () => {
        expect(isBoostActive(boost, Date.parse('2026-06-01T00:00:00Z'))).toBe(true);
    });

    it('treats a completed boost as inactive', () => {
        expect(isBoostActive({ ...boost, status: 'completed' }, Date.now())).toBe(false);
    });

    it('returns only reached milestones in ascending order', () => {
        const reached = reachedMilestones(boost);
        expect(reached.map((m) => m.atCents)).toEqual([50000, 100000]);
    });
});
