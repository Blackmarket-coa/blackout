import { describe, expect, it } from 'vitest';
import {
    TRANSPARENCY_TIER_ENTITLEMENTS,
    type EntitlementAccessPayload,
    type EntitlementTier,
} from '@blackout/protocol';
import { checkTransparencyEntitlements } from '@blackout/sdk';

const payloadFor = (tier: EntitlementTier): EntitlementAccessPayload => ({
    deploymentPreset: 'starter',
    deploymentPresetEntitlements: TRANSPARENCY_TIER_ENTITLEMENTS[tier],
    orgTier: tier,
    orgTierEntitlements: TRANSPARENCY_TIER_ENTITLEMENTS[tier],
    planState: { tier, status: tier === 'free' ? 'inactive' : 'active', isPaid: tier !== 'free' },
});

describe('checkTransparencyEntitlements', () => {
    it('allows the self-report (enabled) on free', () => {
        const result = checkTransparencyEntitlements(payloadFor('free'), {});
        expect(result.ok).toBe(true);
    });

    it('reports feature_disabled when transparency is not enabled', () => {
        const payload: EntitlementAccessPayload = {
            deploymentPreset: 'starter',
            deploymentPresetEntitlements: {},
            orgTier: 'free',
            planState: { tier: 'free', status: 'inactive', isPaid: false },
        };
        const result = checkTransparencyEntitlements(payload, {});
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('feature_disabled');
    });

    it('gates audit export behind team for free users', () => {
        const result = checkTransparencyEntitlements(payloadFor('free'), {
            requestAuditExport: true,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.reason).toBe('export_not_entitled');
            expect(result.suggestedTier).toBe('team');
        }
    });

    it('still gates audit export on pro (only team+ has it)', () => {
        const result = checkTransparencyEntitlements(payloadFor('pro'), {
            requestAuditExport: true,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('export_not_entitled');
    });

    it('allows audit export on team and enterprise', () => {
        expect(
            checkTransparencyEntitlements(payloadFor('team'), { requestAuditExport: true }).ok
        ).toBe(true);
        expect(
            checkTransparencyEntitlements(payloadFor('enterprise'), { requestAuditExport: true }).ok
        ).toBe(true);
    });
});
