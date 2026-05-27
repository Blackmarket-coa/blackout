import { describe, expect, it } from 'vitest';
import {
    DEFAULT_SLOWMODE_CONFIG,
    MAX_SLOWMODE_SECONDS,
    evaluateSlowmode,
    parseSlowmodeConfig,
} from '../../../../src/app/features/room/slowmode';

describe('parseSlowmodeConfig', () => {
    it('returns the default config for missing/invalid content', () => {
        expect(parseSlowmodeConfig(undefined)).toEqual(DEFAULT_SLOWMODE_CONFIG);
        expect(parseSlowmodeConfig(null)).toEqual(DEFAULT_SLOWMODE_CONFIG);
        expect(parseSlowmodeConfig({} as Record<string, unknown>)).toEqual(DEFAULT_SLOWMODE_CONFIG);
    });

    it('treats enabled as false when delay is zero', () => {
        const config = parseSlowmodeConfig({ enabled: true, delaySeconds: 0 });
        expect(config.enabled).toBe(false);
    });

    it('clamps the delay to the maximum and floors fractional input', () => {
        expect(parseSlowmodeConfig({ enabled: true, delaySeconds: 10.9 }).delaySeconds).toBe(10);
        expect(parseSlowmodeConfig({ enabled: true, delaySeconds: 999999 }).delaySeconds).toBe(
            MAX_SLOWMODE_SECONDS
        );
        expect(parseSlowmodeConfig({ enabled: true, delaySeconds: -5 }).delaySeconds).toBe(0);
    });
});

describe('evaluateSlowmode', () => {
    const config = { enabled: true, delaySeconds: 10, exemptPowerLevel: 50 };

    it('allows when slow mode is disabled', () => {
        expect(
            evaluateSlowmode({
                config: { ...config, enabled: false },
                lastSentTs: 1000,
                now: 1001,
                userPowerLevel: 0,
            })
        ).toEqual({ allowed: true, retryAfterMs: 0 });
    });

    it('allows exempt members regardless of recency', () => {
        expect(
            evaluateSlowmode({ config, lastSentTs: 1000, now: 1001, userPowerLevel: 50 }).allowed
        ).toBe(true);
    });

    it('allows the first message (no prior send)', () => {
        expect(
            evaluateSlowmode({ config, lastSentTs: null, now: 5000, userPowerLevel: 0 }).allowed
        ).toBe(true);
    });

    it('blocks within the window and reports remaining time', () => {
        const verdict = evaluateSlowmode({
            config,
            lastSentTs: 1000,
            now: 4000,
            userPowerLevel: 0,
        });
        expect(verdict.allowed).toBe(false);
        expect(verdict.retryAfterMs).toBe(7000);
    });

    it('allows once the window has elapsed', () => {
        expect(
            evaluateSlowmode({ config, lastSentTs: 1000, now: 12000, userPowerLevel: 0 }).allowed
        ).toBe(true);
    });
});
