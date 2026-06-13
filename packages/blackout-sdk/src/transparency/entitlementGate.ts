/**
 * Tier-aware transparency entitlement checks (OSS-manifest group G9).
 *
 * The self-service report and warrant canary are free; org-scoped audit
 * export is a `team`+ capability. Mirrors the other SDK entitlement gates.
 */

import {
    TRANSPARENCY_ENTITLEMENT_KEYS,
    type EntitlementAccessPayload,
    type EntitlementTier,
} from '@blackout/protocol';
import { resolveSdkEntitlement } from '../entitlements';

export type TransparencyGateInput = {
    requestAuditExport?: boolean;
};

export type TransparencyGateReason = 'feature_disabled' | 'export_not_entitled';

export type TransparencyGateResult =
    | { ok: true; tier: EntitlementTier }
    | {
          ok: false;
          tier: EntitlementTier;
          reason: TransparencyGateReason;
          message: string;
          suggestedTier?: EntitlementTier;
      };

const TIER_ORDER: readonly EntitlementTier[] = ['free', 'pro', 'team', 'enterprise'];

const tierFromPayload = (payload: EntitlementAccessPayload): EntitlementTier =>
    payload.planState?.tier ?? payload.orgTier ?? 'free';

const suggestTier = (
    payload: EntitlementAccessPayload,
    key: string,
    currentTier: EntitlementTier
): EntitlementTier | undefined => {
    for (let i = TIER_ORDER.indexOf(currentTier) + 1; i < TIER_ORDER.length; i += 1) {
        const probe = resolveSdkEntitlement({
            payload: {
                ...payload,
                planState: { ...payload.planState, tier: TIER_ORDER[i], status: 'active', isPaid: true },
            },
            key: key as `features.${string}`,
        });
        if (probe.enabled) return TIER_ORDER[i];
    }
    return undefined;
};

export const checkTransparencyEntitlements = (
    payload: EntitlementAccessPayload,
    input: TransparencyGateInput
): TransparencyGateResult => {
    const tier = tierFromPayload(payload);
    const probe = (key: string) =>
        resolveSdkEntitlement({ payload, key: key as `features.${string}` }).enabled;

    if (!probe(TRANSPARENCY_ENTITLEMENT_KEYS.enabled)) {
        return {
            ok: false,
            tier,
            reason: 'feature_disabled',
            message: 'Transparency reports are not enabled for your account.',
            suggestedTier: suggestTier(payload, TRANSPARENCY_ENTITLEMENT_KEYS.enabled, tier),
        };
    }

    if (input.requestAuditExport && !probe(TRANSPARENCY_ENTITLEMENT_KEYS.auditExport)) {
        return {
            ok: false,
            tier,
            reason: 'export_not_entitled',
            message: 'Org-scoped audit export requires the Team tier or higher.',
            suggestedTier: suggestTier(payload, TRANSPARENCY_ENTITLEMENT_KEYS.auditExport, tier) ?? 'team',
        };
    }

    return { ok: true, tier };
};

export const tierFromTransparencyPayload = tierFromPayload;
