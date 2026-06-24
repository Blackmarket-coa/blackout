import { describe, expect, it } from 'vitest';
import type { GovernanceTreasurySnapshotPayload } from '@blackout/protocol';
import {
    balanceForAsset,
    milestoneProgress,
    parseBalance,
} from '../../../../src/app/features/governance/treasuryProgress';

const snapshot: GovernanceTreasurySnapshotPayload = {
    snapshotId: 'snap-1',
    generatedAt: '2026-06-24T00:00:00.000Z',
    lines: [
        { asset: 'USDC', balance: '12,345.67', delta24h: '+12.50' },
        { asset: 'BTC', balance: '0.5125' },
    ],
};

describe('parseBalance', () => {
    it('parses thousands separators and spaces', () => {
        expect(parseBalance('12,345.67')).toBeCloseTo(12345.67);
        expect(parseBalance('1 000')).toBe(1000);
    });

    it('returns 0 for missing or unparseable input', () => {
        expect(parseBalance(undefined)).toBe(0);
        expect(parseBalance(null)).toBe(0);
        expect(parseBalance('—')).toBe(0);
    });
});

describe('balanceForAsset', () => {
    it('finds the balance for a present asset', () => {
        expect(balanceForAsset(snapshot, 'USDC')).toBeCloseTo(12345.67);
        expect(balanceForAsset(snapshot, 'BTC')).toBeCloseTo(0.5125);
    });

    it('returns 0 for an absent asset or null snapshot', () => {
        expect(balanceForAsset(snapshot, 'XMR')).toBe(0);
        expect(balanceForAsset(null, 'USDC')).toBe(0);
    });
});

describe('milestoneProgress', () => {
    it('computes a clamped percentage and met flag', () => {
        expect(milestoneProgress(50000, 25000)).toEqual({
            current: 25000,
            target: 50000,
            percent: 50,
            met: false,
        });
    });

    it('caps at 100% and flips met once the balance reaches target', () => {
        const result = milestoneProgress(100, 150);
        expect(result.percent).toBe(100);
        expect(result.met).toBe(true);
    });

    it('treats a non-positive target as ungoaled', () => {
        expect(milestoneProgress(0, 5)).toEqual({
            current: 5,
            target: 0,
            percent: 0,
            met: false,
        });
    });

    it('floors a negative balance at zero', () => {
        const result = milestoneProgress(100, -20);
        expect(result.current).toBe(0);
        expect(result.percent).toBe(0);
    });
});
