import { describe, expect, it } from 'vitest';
import {
    ACTIVE_DEFENSE_TIER_ENTITLEMENTS,
    type EntitlementAccessPayload,
    type EntitlementTier,
} from '@blackout/protocol';
import { checkActiveDefenseEntitlements } from '@blackout/sdk';

const payloadFor = (tier: EntitlementTier): EntitlementAccessPayload => ({
    deploymentPreset: 'starter',
    deploymentPresetEntitlements: ACTIVE_DEFENSE_TIER_ENTITLEMENTS[tier],
    orgTier: tier,
    orgTierEntitlements: ACTIVE_DEFENSE_TIER_ENTITLEMENTS[tier],
    planState: { tier, status: tier === 'free' ? 'inactive' : 'active', isPaid: tier !== 'free' },
});

describe('checkActiveDefenseEntitlements', () => {
    it('reports feature_disabled for non-enterprise tiers', () => {
        for (const tier of ['free', 'pro', 'team'] as EntitlementTier[]) {
            const result = checkActiveDefenseEntitlements(payloadFor(tier), {});
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.reason).toBe('feature_disabled');
                expect(result.suggestedTier).toBe('enterprise');
            }
        }
    });

    it('allows enterprise with no action requested', () => {
        expect(checkActiveDefenseEntitlements(payloadFor('enterprise'), {}).ok).toBe(true);
    });

    it('requires explicit consent before a canary/decoy action', () => {
        const result = checkActiveDefenseEntitlements(payloadFor('enterprise'), {
            requestCanaryTokens: true,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('consent_required');
    });

    it('allows canary + decoy on enterprise with consent', () => {
        const result = checkActiveDefenseEntitlements(payloadFor('enterprise'), {
            requestCanaryTokens: true,
            requestDecoyData: true,
            adminConsent: true,
        });
        expect(result.ok).toBe(true);
    });

    it('gates the specific capability when enabled but sub-key is absent', () => {
        const payload: EntitlementAccessPayload = {
            deploymentPreset: 'starter',
            deploymentPresetEntitlements: {
                'features.activedefense.enabled': true,
                'features.activedefense.canaryTokens': false,
            },
            orgTier: 'enterprise',
            planState: { tier: 'enterprise', status: 'active', isPaid: true },
        };
        const result = checkActiveDefenseEntitlements(payload, {
            requestCanaryTokens: true,
            adminConsent: true,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('canary_not_entitled');
    });
});
