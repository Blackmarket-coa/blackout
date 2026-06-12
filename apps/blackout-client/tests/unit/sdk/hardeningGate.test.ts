import { describe, expect, it } from 'vitest';
import {
    HARDENING_TIER_ENTITLEMENTS,
    type EntitlementAccessPayload,
    type EntitlementTier,
} from '@blackout/protocol';
import { checkHardeningEntitlements } from '@blackout/sdk';

const payloadFor = (tier: EntitlementTier): EntitlementAccessPayload => ({
    deploymentPreset: 'starter',
    deploymentPresetEntitlements: HARDENING_TIER_ENTITLEMENTS[tier],
    orgTier: tier,
    orgTierEntitlements: HARDENING_TIER_ENTITLEMENTS[tier],
    planState: { tier, status: tier === 'free' ? 'inactive' : 'active', isPaid: tier !== 'free' },
});

describe('checkHardeningEntitlements', () => {
    it('allows basic hardening (enabled) on free', () => {
        const result = checkHardeningEntitlements(payloadFor('free'), {});
        expect(result.ok).toBe(true);
    });

    it('reports feature_disabled when hardening is not enabled', () => {
        const payload: EntitlementAccessPayload = {
            deploymentPreset: 'starter',
            deploymentPresetEntitlements: {},
            orgTier: 'free',
            planState: { tier: 'free', status: 'inactive', isPaid: false },
        };
        const result = checkHardeningEntitlements(payload, {});
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('feature_disabled');
    });

    it('gates image perturbation behind pro for free users', () => {
        const result = checkHardeningEntitlements(payloadFor('free'), { requestPerturbation: true });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toBe('perturbation_not_entitled');
            expect(result.suggestedTier).toBe('pro');
        }
    });

    it('allows perturbation + tor + decoy on pro', () => {
        const result = checkHardeningEntitlements(payloadFor('pro'), {
            requestPerturbation: true,
            requestTorTransport: true,
            requestDecoyTraffic: true,
        });
        expect(result.ok).toBe(true);
    });

    it('gates tor transport and decoy traffic for free users', () => {
        const tor = checkHardeningEntitlements(payloadFor('free'), { requestTorTransport: true });
        expect(tor.ok).toBe(false);
        if (!tor.ok) expect(tor.reason).toBe('tor_not_entitled');

        const decoy = checkHardeningEntitlements(payloadFor('free'), { requestDecoyTraffic: true });
        expect(decoy.ok).toBe(false);
        if (!decoy.ok) expect(decoy.reason).toBe('decoy_not_entitled');
    });
});
