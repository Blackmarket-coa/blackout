import { describe, expect, it } from 'vitest';
import {
    DEFAULT_ONBOARDING_POLICY,
    onboardingBlocked,
    summarizePosture,
    type AccountPosture,
} from './encryptionPosture';

const base: AccountPosture = {
    crossSigningReady: true,
    currentDeviceVerified: true,
    otherOwnDevices: [],
    members: [],
};

describe('summarizePosture', () => {
    it('returns ok when everything is set up and verified', () => {
        const v = summarizePosture(base);
        expect(v.severity).toBe('ok');
        expect(v.headline).toMatch(/encrypted and verified/i);
        expect(v.actions).toHaveLength(0);
    });

    it('flags critical when cross-signing is not set up', () => {
        const v = summarizePosture({ ...base, crossSigningReady: false });
        expect(v.severity).toBe('critical');
        expect(v.actions[0].id).toBe('enable_cross_signing');
    });

    it('flags critical when current device is not verified', () => {
        const v = summarizePosture({ ...base, currentDeviceVerified: false });
        expect(v.severity).toBe('critical');
        expect(v.actions[0].id).toBe('verify_current_device');
        expect(v.detail).toMatch(/recovery key/);
    });

    it('suggests using another verified session when one exists', () => {
        const v = summarizePosture({
            ...base,
            currentDeviceVerified: false,
            otherOwnDevices: [{ deviceId: 'D2', verification: 'verified' }],
        });
        expect(v.detail).toMatch(/another verified session/);
    });

    it('reports unverified members as info-severity', () => {
        const v = summarizePosture({
            ...base,
            members: [
                {
                    userId: '@bob:server',
                    devices: [
                        { deviceId: 'B1', verification: 'verified' },
                        { deviceId: 'B2', verification: 'unverified' },
                    ],
                },
            ],
        });
        expect(v.severity).toBe('info');
        expect(v.headline).toMatch(/1 unverified device/);
    });

    it('pluralizes the unverified-device headline correctly', () => {
        const v = summarizePosture({
            ...base,
            members: [
                {
                    userId: '@bob:server',
                    devices: [
                        { deviceId: 'B1', verification: 'unverified' },
                        { deviceId: 'B2', verification: 'unverified' },
                    ],
                },
            ],
        });
        expect(v.headline).toMatch(/2 unverified devices/);
    });

    it('orders critical conditions ahead of member warnings', () => {
        const v = summarizePosture({
            crossSigningReady: false,
            currentDeviceVerified: false,
            otherOwnDevices: [],
            members: [
                {
                    userId: '@bob:server',
                    devices: [{ deviceId: 'B1', verification: 'unverified' }],
                },
            ],
        });
        expect(v.severity).toBe('critical');
        expect(v.actions[0].id).toBe('enable_cross_signing');
    });
});

describe('onboardingBlocked', () => {
    it('blocks when cross-signing is missing under default policy', () => {
        expect(onboardingBlocked({ crossSigningReady: false })).toBe(true);
    });

    it('passes through when cross-signing is configured', () => {
        expect(onboardingBlocked({ crossSigningReady: true })).toBe(false);
    });

    it('honors a relaxed policy', () => {
        expect(
            onboardingBlocked({ crossSigningReady: false }, { requireCrossSigning: false }),
        ).toBe(false);
    });

    it('is consistent with DEFAULT_ONBOARDING_POLICY', () => {
        expect(DEFAULT_ONBOARDING_POLICY.requireCrossSigning).toBe(true);
    });
});
