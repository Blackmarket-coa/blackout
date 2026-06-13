import { describe, expect, it } from 'vitest';
import {
    SHIELD_TIER_ENTITLEMENTS,
    type EntitlementAccessPayload,
    type EntitlementTier,
} from '@blackout/protocol';
import { checkShieldEntitlements } from '@blackout/sdk';

const payloadFor = (tier: EntitlementTier): EntitlementAccessPayload => ({
    deploymentPreset: 'starter',
    deploymentPresetEntitlements: SHIELD_TIER_ENTITLEMENTS[tier],
    orgTier: tier,
    orgTierEntitlements: SHIELD_TIER_ENTITLEMENTS[tier],
    planState: { tier, status: tier === 'free' ? 'inactive' : 'active', isPaid: tier !== 'free' },
});

describe('checkShieldEntitlements', () => {
    it('is available as a free baseline on every tier', () => {
        for (const tier of ['free', 'pro', 'team', 'enterprise'] as EntitlementTier[]) {
            expect(checkShieldEntitlements(payloadFor(tier)).ok).toBe(true);
        }
    });

    it('reports feature_disabled when the baseline is absent (locked-down preset)', () => {
        const payload: EntitlementAccessPayload = {
            deploymentPreset: 'starter',
            deploymentPresetEntitlements: {},
            orgTier: 'free',
            planState: { tier: 'free', status: 'inactive', isPaid: false },
        };
        const result = checkShieldEntitlements(payload);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('feature_disabled');
    });
});
