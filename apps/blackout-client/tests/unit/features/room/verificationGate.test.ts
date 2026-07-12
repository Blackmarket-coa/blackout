import { describe, expect, it } from 'vitest';

import {
    DEFAULT_VERIFICATION_GATE_CONFIG,
    MAX_MIN_ACCOUNT_AGE_HOURS,
    MAX_MIN_MEMBERSHIP_MINUTES,
    evaluateVerificationGate,
    formatGateWait,
    parseVerificationGateConfig,
} from '../../../../src/app/features/room/verificationGate';

describe('parseVerificationGateConfig', () => {
    it('falls back to the default for missing/invalid content', () => {
        expect(parseVerificationGateConfig(undefined)).toEqual(DEFAULT_VERIFICATION_GATE_CONFIG);
        expect(parseVerificationGateConfig(null)).toEqual(DEFAULT_VERIFICATION_GATE_CONFIG);
        expect(parseVerificationGateConfig({})).toEqual(DEFAULT_VERIFICATION_GATE_CONFIG);
    });

    it('disables a gate with no active rule', () => {
        const config = parseVerificationGateConfig({
            enabled: true,
            minMembershipMinutes: 0,
            minAccountAgeHours: 0,
        });
        expect(config.enabled).toBe(false);
    });

    it('enables when either rule is active', () => {
        expect(
            parseVerificationGateConfig({ enabled: true, minMembershipMinutes: 10 }).enabled
        ).toBe(true);
        expect(parseVerificationGateConfig({ enabled: true, minAccountAgeHours: 24 }).enabled).toBe(
            true
        );
        // enabled flag must still be explicit.
        expect(parseVerificationGateConfig({ minMembershipMinutes: 10 }).enabled).toBe(false);
    });

    it('floors and clamps rule values', () => {
        const config = parseVerificationGateConfig({
            enabled: true,
            minMembershipMinutes: 10.9,
            minAccountAgeHours: 999999,
        });
        expect(config.minMembershipMinutes).toBe(10);
        expect(config.minAccountAgeHours).toBe(MAX_MIN_ACCOUNT_AGE_HOURS);
        expect(
            parseVerificationGateConfig({ enabled: true, minMembershipMinutes: 999999999 })
                .minMembershipMinutes
        ).toBe(MAX_MIN_MEMBERSHIP_MINUTES);
        expect(
            parseVerificationGateConfig({ enabled: true, minMembershipMinutes: -5 })
                .minMembershipMinutes
        ).toBe(0);
    });
});

describe('evaluateVerificationGate', () => {
    const config = parseVerificationGateConfig({ enabled: true, minMembershipMinutes: 10 });
    const base = { config, accountCreatedTs: null, userPowerLevel: 0 };

    it('allows when the gate is disabled', () => {
        expect(
            evaluateVerificationGate({
                ...base,
                config: DEFAULT_VERIFICATION_GATE_CONFIG,
                joinedAtTs: 0,
                now: 1,
            }).allowed
        ).toBe(true);
    });

    it('exempts members at or above the exempt power level', () => {
        expect(
            evaluateVerificationGate({ ...base, joinedAtTs: 0, now: 1, userPowerLevel: 50 }).allowed
        ).toBe(true);
    });

    it('blocks a too-new member with the remaining wait', () => {
        const verdict = evaluateVerificationGate({
            ...base,
            joinedAtTs: 0,
            now: 4 * 60_000, // 4 of 10 minutes served
        });
        expect(verdict.allowed).toBe(false);
        expect(verdict.reason).toBe('membership_age');
        expect(verdict.retryAfterMs).toBe(6 * 60_000);
    });

    it('allows once the membership period is served', () => {
        expect(evaluateVerificationGate({ ...base, joinedAtTs: 0, now: 10 * 60_000 }).allowed).toBe(
            true
        );
    });

    it('fails open when the join timestamp is unknown', () => {
        expect(evaluateVerificationGate({ ...base, joinedAtTs: null, now: 1 }).allowed).toBe(true);
    });

    it('blocks on account age only when the timestamp is known', () => {
        const ageConfig = parseVerificationGateConfig({ enabled: true, minAccountAgeHours: 24 });
        // Unknown creation time (the client-side case) fails open.
        expect(
            evaluateVerificationGate({
                config: ageConfig,
                joinedAtTs: 0,
                accountCreatedTs: null,
                now: 1,
                userPowerLevel: 0,
            }).allowed
        ).toBe(true);
        // A known too-young account is blocked.
        const verdict = evaluateVerificationGate({
            config: ageConfig,
            joinedAtTs: 0,
            accountCreatedTs: 0,
            now: 60_000,
            userPowerLevel: 0,
        });
        expect(verdict.allowed).toBe(false);
        expect(verdict.reason).toBe('account_age');
    });
});

describe('formatGateWait', () => {
    it('formats minutes and hours with pluralization', () => {
        expect(formatGateWait(30_000)).toBe('1 minute');
        expect(formatGateWait(6 * 60_000)).toBe('6 minutes');
        expect(formatGateWait(59 * 60_000)).toBe('59 minutes');
        expect(formatGateWait(60 * 60_000)).toBe('1 hour');
        expect(formatGateWait(23.5 * 3_600_000)).toBe('24 hours');
    });
});
