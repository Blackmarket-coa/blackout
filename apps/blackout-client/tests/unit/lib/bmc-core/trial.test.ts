import { describe, expect, it } from 'vitest';
import {
    DEFAULT_TRIAL_DAYS,
    TRIAL_FALLBACK_PLAYBOOK,
    computeTrialStatus,
    trialHasLapsed,
} from '../../../../src/lib/bmc-core/trial';

const day = (n: number) => n * 86_400_000;

describe('computeTrialStatus', () => {
    it('returns NO_TRIAL when the playbook is committed', () => {
        const status = computeTrialStatus({ mode: 'committed' });
        expect(status.isTrial).toBe(false);
        expect(status.daysRemaining).toBe(0);
        expect(status.startedAtMs).toBeNull();
    });

    it('returns NO_TRIAL when trialStartedAt is missing', () => {
        const status = computeTrialStatus({ mode: 'trial' });
        expect(status.isTrial).toBe(false);
    });

    it('returns NO_TRIAL when trialStartedAt is malformed', () => {
        const status = computeTrialStatus({ mode: 'trial', trialStartedAt: 'not-a-date' });
        expect(status.isTrial).toBe(false);
    });

    it('counts 14 days at trial start', () => {
        const start = Date.parse('2026-05-01T00:00:00Z');
        const status = computeTrialStatus(
            { mode: 'trial', trialStartedAt: '2026-05-01T00:00:00Z' },
            start,
        );
        expect(status.isTrial).toBe(true);
        expect(status.daysRemaining).toBe(DEFAULT_TRIAL_DAYS);
    });

    it('rounds up so the last day still reads "1 day left"', () => {
        const start = Date.parse('2026-05-01T00:00:00Z');
        const status = computeTrialStatus(
            { mode: 'trial', trialStartedAt: '2026-05-01T00:00:00Z' },
            start + day(13) + 60 * 60 * 1000, // 13d 1h elapsed
        );
        expect(status.daysRemaining).toBe(1);
    });

    it('goes negative once the trial has lapsed', () => {
        const start = Date.parse('2026-05-01T00:00:00Z');
        const status = computeTrialStatus(
            { mode: 'trial', trialStartedAt: '2026-05-01T00:00:00Z' },
            start + day(20),
        );
        expect(status.daysRemaining).toBeLessThan(0);
        expect(trialHasLapsed(status)).toBe(true);
    });

    it('honors a custom trial-day window', () => {
        const start = Date.parse('2026-05-01T00:00:00Z');
        const status = computeTrialStatus(
            { mode: 'trial', trialStartedAt: '2026-05-01T00:00:00Z' },
            start,
            7,
        );
        expect(status.daysRemaining).toBe(7);
    });
});

describe('TRIAL_FALLBACK_PLAYBOOK', () => {
    it('is Hearth — the lowest-stakes default', () => {
        expect(TRIAL_FALLBACK_PLAYBOOK).toBe('hearth');
    });
});
