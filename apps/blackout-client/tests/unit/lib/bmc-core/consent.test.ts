import { describe, expect, it } from 'vitest';
import {
    CONSENT_KEYS,
    deriveConsentStatus,
    isConsentKey,
    tallyConsent,
    type ConsentReaction,
} from '../../../../src/lib/bmc-core/consent';

const reaction = (
    reactorId: string,
    key: ConsentReaction['key'],
    timestamp: number,
    note?: string,
): ConsentReaction => ({
    reactorId,
    key,
    eventId: `evt-${reactorId}-${timestamp}`,
    timestamp,
    note,
});

describe('isConsentKey', () => {
    it('accepts the three consent keys', () => {
        for (const key of CONSENT_KEYS) {
            expect(isConsentKey(key)).toBe(true);
        }
    });

    it('rejects everything else', () => {
        expect(isConsentKey('👍')).toBe(false);
        expect(isConsentKey('')).toBe(false);
        expect(isConsentKey(null)).toBe(false);
        expect(isConsentKey(undefined)).toBe(false);
    });
});

describe('tallyConsent', () => {
    it('returns the empty tally for no reactions', () => {
        const result = tallyConsent([]);
        expect(result.consents).toBe(0);
        expect(result.concerns).toEqual([]);
        expect(result.objections).toEqual([]);
        expect(result.blocked).toBe(false);
        expect(result.totalReactors).toBe(0);
    });

    it('counts unique reactors with safe-to-try as consents', () => {
        const result = tallyConsent([
            reaction('@alice:x', '🌱', 1),
            reaction('@bob:x', '🌱', 2),
        ]);
        expect(result.consents).toBe(2);
        expect(result.blocked).toBe(false);
        expect(result.totalReactors).toBe(2);
    });

    it('uses the latest reaction per reactor (revisit-as-redact pattern)', () => {
        const result = tallyConsent([
            reaction('@alice:x', '🌱', 1),
            reaction('@alice:x', '🪨', 5, 'on reflection, I anticipate harm'),
        ]);
        expect(result.consents).toBe(0);
        expect(result.objections.length).toBe(1);
        expect(result.objections[0].note).toContain('on reflection');
        expect(result.blocked).toBe(true);
    });

    it('sorts concerns and objections newest-first', () => {
        const result = tallyConsent([
            reaction('@alice:x', '🌾', 1, 'first'),
            reaction('@bob:x', '🌾', 10, 'second'),
            reaction('@carol:x', '🪨', 5, 'A'),
            reaction('@dave:x', '🪨', 15, 'B'),
        ]);
        expect(result.concerns.map((c) => c.note)).toEqual(['second', 'first']);
        expect(result.objections.map((o) => o.note)).toEqual(['B', 'A']);
    });

    it('blocks the moment any paramount objection lands', () => {
        const result = tallyConsent([
            reaction('@alice:x', '🌱', 1),
            reaction('@bob:x', '🌱', 2),
            reaction('@carol:x', '🪨', 3, 'safety risk'),
        ]);
        expect(result.consents).toBe(2);
        expect(result.objections.length).toBe(1);
        expect(result.blocked).toBe(true);
    });

    it('ignores reactions with unknown keys (defensive)', () => {
        const result = tallyConsent([
            reaction('@alice:x', '🌱', 1),
            // @ts-expect-error force a stray key through the type
            { reactorId: '@stray:x', key: '👍', eventId: 'e', timestamp: 2 },
        ]);
        expect(result.consents).toBe(1);
        expect(result.totalReactors).toBe(1);
    });
});

describe('deriveConsentStatus', () => {
    const baseTally = tallyConsent([]);

    it('stays active before the deadline', () => {
        const status = deriveConsentStatus({
            tally: baseTally,
            quorum: 1,
            deadlineMs: 100,
            nowMs: 50,
        });
        expect(status).toBe('active');
    });

    it('passes after the deadline when consents meet quorum and no objection blocks', () => {
        const tally = tallyConsent([
            reaction('@a:x', '🌱', 1),
            reaction('@b:x', '🌱', 2),
        ]);
        const status = deriveConsentStatus({
            tally,
            quorum: 2,
            deadlineMs: 10,
            nowMs: 50,
        });
        expect(status).toBe('passed');
    });

    it('fails after the deadline when blocked, regardless of quorum', () => {
        const tally = tallyConsent([
            reaction('@a:x', '🌱', 1),
            reaction('@b:x', '🌱', 2),
            reaction('@c:x', '🪨', 3),
        ]);
        const status = deriveConsentStatus({
            tally,
            quorum: 2,
            deadlineMs: 10,
            nowMs: 50,
        });
        expect(status).toBe('failed');
    });

    it('fails after the deadline when consents are short of quorum', () => {
        const tally = tallyConsent([reaction('@a:x', '🌱', 1)]);
        const status = deriveConsentStatus({
            tally,
            quorum: 3,
            deadlineMs: 10,
            nowMs: 50,
        });
        expect(status).toBe('failed');
    });
});
