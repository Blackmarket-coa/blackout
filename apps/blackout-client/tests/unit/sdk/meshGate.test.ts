import { describe, expect, it } from 'vitest';
import {
    MESH_TIER_ENTITLEMENTS,
    type EntitlementAccessPayload,
    type EntitlementTier,
} from '@blackout/protocol';
import { checkMeshEntitlements } from '@blackout/sdk';

const payloadFor = (tier: EntitlementTier): EntitlementAccessPayload => ({
    deploymentPreset: 'starter',
    deploymentPresetEntitlements: MESH_TIER_ENTITLEMENTS[tier],
    orgTier: tier,
    orgTierEntitlements: MESH_TIER_ENTITLEMENTS[tier],
    planState: { tier, status: tier === 'free' ? 'inactive' : 'active', isPaid: tier !== 'free' },
});

describe('checkMeshEntitlements', () => {
    it('reports feature_disabled for non-enterprise tiers', () => {
        for (const tier of ['free', 'pro', 'team'] as EntitlementTier[]) {
            const result = checkMeshEntitlements(payloadFor(tier));
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.reason).toBe('feature_disabled');
                expect(result.suggestedTier).toBe('enterprise');
            }
        }
    });

    it('allows mesh + peer sync on enterprise', () => {
        expect(checkMeshEntitlements(payloadFor('enterprise')).ok).toBe(true);
        expect(checkMeshEntitlements(payloadFor('enterprise'), { requestPeerSync: true }).ok).toBe(
            true
        );
    });

    it('gates peer sync when enabled but the sub-capability is absent', () => {
        const payload: EntitlementAccessPayload = {
            deploymentPreset: 'starter',
            deploymentPresetEntitlements: {
                'features.mesh.enabled': true,
                'features.mesh.peerSync': false,
            },
            orgTier: 'enterprise',
            planState: { tier: 'enterprise', status: 'active', isPaid: true },
        };
        const result = checkMeshEntitlements(payload, { requestPeerSync: true });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('sync_not_entitled');
    });
});
