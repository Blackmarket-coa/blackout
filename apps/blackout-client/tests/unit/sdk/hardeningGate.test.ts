import { describe, expect, it } from 'vitest';
import {
    HARDENING_CAPABILITY_IMPLEMENTED,
    HARDENING_ENTITLEMENT_KEYS,
    HARDENING_TIER_ENTITLEMENTS,
    isUnbuiltHardeningKey,
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

const TIERS: EntitlementTier[] = ['free', 'pro', 'team', 'enterprise'];

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
        const result = checkHardeningEntitlements(payloadFor('free'), {
            requestPerturbation: true,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toBe('perturbation_not_entitled');
            expect(result.suggestedTier).toBe('pro');
        }
    });

    it('allows image perturbation, the one built capability, on pro', () => {
        const result = checkHardeningEntitlements(payloadFor('pro'), { requestPerturbation: true });
        expect(result.ok).toBe(true);
    });

    /**
     * Until 2026-11-16 this file had "allows perturbation + tor + decoy on
     * pro" and expected `ok`. Tor transport and decoy traffic have entitlement
     * keys and no implementation, so an `ok` told a caller it could go on as
     * if its traffic were anonymized, and the refusal a free user got
     * ("requires the Pro tier or higher", with Pro suggested) sold a
     * capability no tier provides. docs/security/trust-claims-2026-11-16.md.
     */
    it('refuses Tor transport on every tier while it is not built, and suggests no tier', () => {
        expect(HARDENING_CAPABILITY_IMPLEMENTED.torTransport).toBe(false);
        for (const tier of TIERS) {
            const result = checkHardeningEntitlements(payloadFor(tier), {
                requestTorTransport: true,
            });
            expect(result.ok, tier).toBe(false);
            if (!result.ok) {
                expect(result.reason, tier).toBe('tor_not_implemented');
                expect(result.suggestedTier, tier).toBeUndefined();
                expect(result.message, tier).toMatch(/not built/);
                expect(result.message, tier).not.toMatch(/requires the Pro tier/);
            }
        }
    });

    it('refuses decoy traffic on every tier while it is not built, and suggests no tier', () => {
        expect(HARDENING_CAPABILITY_IMPLEMENTED.decoyTraffic).toBe(false);
        for (const tier of TIERS) {
            const result = checkHardeningEntitlements(payloadFor(tier), {
                requestDecoyTraffic: true,
            });
            expect(result.ok, tier).toBe(false);
            if (!result.ok) {
                expect(result.reason, tier).toBe('decoy_not_implemented');
                expect(result.suggestedTier, tier).toBeUndefined();
                expect(result.message, tier).toMatch(/not built/);
            }
        }
    });

    it('refuses a request that asks for a built capability and an unbuilt one together', () => {
        const result = checkHardeningEntitlements(payloadFor('pro'), {
            requestPerturbation: true,
            requestTorTransport: true,
            requestDecoyTraffic: true,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('tor_not_implemented');
    });
});

describe('isUnbuiltHardeningKey', () => {
    it('is true for exactly the hardening keys whose capability is not built', () => {
        expect(isUnbuiltHardeningKey(HARDENING_ENTITLEMENT_KEYS.torTransport)).toBe(true);
        expect(isUnbuiltHardeningKey(HARDENING_ENTITLEMENT_KEYS.decoyTraffic)).toBe(true);
        expect(isUnbuiltHardeningKey(HARDENING_ENTITLEMENT_KEYS.imagePerturbation)).toBe(false);
        expect(isUnbuiltHardeningKey(HARDENING_ENTITLEMENT_KEYS.enabled)).toBe(false);
        expect(isUnbuiltHardeningKey('features.persona.rotation')).toBe(false);
        expect(isUnbuiltHardeningKey('')).toBe(false);
    });
});
