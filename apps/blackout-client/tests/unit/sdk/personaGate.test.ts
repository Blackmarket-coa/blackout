import { describe, expect, it } from 'vitest';
import {
    PERSONA_QUOTAS,
    PERSONA_TIER_ENTITLEMENTS,
    type EntitlementAccessPayload,
    type EntitlementTier,
} from '@blackout/protocol';
import { checkPersonaEntitlements } from '@blackout/sdk';

const payloadFor = (tier: EntitlementTier): EntitlementAccessPayload => ({
    deploymentPreset: 'starter',
    deploymentPresetEntitlements: PERSONA_TIER_ENTITLEMENTS[tier],
    orgTier: tier,
    orgTierEntitlements: PERSONA_TIER_ENTITLEMENTS[tier],
    planState: { tier, status: tier === 'free' ? 'inactive' : 'active', isPaid: tier !== 'free' },
});

describe('checkPersonaEntitlements', () => {
    it('allows a free user to create their first persona', () => {
        const result = checkPersonaEntitlements(payloadFor('free'), {
            activePersonaCount: 0,
            requestRotation: false,
            requestCompartments: false,
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.quotas.maxPersonas).toBe(PERSONA_QUOTAS.free.maxPersonas);
    });

    it('blocks a free user at the roster cap and suggests pro', () => {
        const result = checkPersonaEntitlements(payloadFor('free'), {
            activePersonaCount: PERSONA_QUOTAS.free.maxPersonas,
            requestRotation: false,
            requestCompartments: false,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toBe('roster_full');
            expect(result.suggestedTier).toBe('pro');
        }
    });

    it('allows pro up to its larger roster cap', () => {
        const result = checkPersonaEntitlements(payloadFor('pro'), {
            activePersonaCount: PERSONA_QUOTAS.pro.maxPersonas - 1,
            requestRotation: true,
            requestCompartments: true,
        });
        expect(result.ok).toBe(true);
    });

    it('gates rotation behind pro for free users', () => {
        const result = checkPersonaEntitlements(payloadFor('free'), {
            activePersonaCount: 0,
            requestRotation: true,
            requestCompartments: false,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toBe('rotation_not_entitled');
            expect(result.suggestedTier).toBe('pro');
        }
    });

    it('gates compartments behind pro for free users', () => {
        const result = checkPersonaEntitlements(payloadFor('free'), {
            activePersonaCount: 0,
            requestRotation: false,
            requestCompartments: true,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('compartments_not_entitled');
    });

    it('treats enterprise as unlimited roster', () => {
        const result = checkPersonaEntitlements(payloadFor('enterprise'), {
            activePersonaCount: 9999,
            requestRotation: true,
            requestCompartments: true,
        });
        expect(result.ok).toBe(true);
    });
});
