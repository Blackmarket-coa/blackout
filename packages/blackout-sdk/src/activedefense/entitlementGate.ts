/**
 * Tier-aware active-defense entitlement checks (OSS-manifest group G5).
 *
 * Active defense (canary tokens, decoy data) is `enterprise`-only AND requires
 * explicit admin consent at call time — defensive, local-only primitives that
 * are never default-on (ethics §4). The gate enforces both: the tier
 * entitlement and the operator-consent acknowledgement.
 */

import {
    ACTIVE_DEFENSE_ENTITLEMENT_KEYS,
    type EntitlementAccessPayload,
    type EntitlementTier,
} from '@blackout/protocol';
import { resolveSdkEntitlement } from '../entitlements';

export type ActiveDefenseGateInput = {
    requestCanaryTokens?: boolean;
    requestDecoyData?: boolean;
    /** Operator must explicitly acknowledge the defensive-use consent. */
    adminConsent?: boolean;
};

export type ActiveDefenseGateReason =
    | 'feature_disabled'
    | 'canary_not_entitled'
    | 'decoy_not_entitled'
    | 'consent_required';

export type ActiveDefenseGateResult =
    | { ok: true; tier: EntitlementTier }
    | {
          ok: false;
          tier: EntitlementTier;
          reason: ActiveDefenseGateReason;
          message: string;
          suggestedTier?: EntitlementTier;
      };

const tierFromPayload = (payload: EntitlementAccessPayload): EntitlementTier =>
    payload.planState?.tier ?? payload.orgTier ?? 'free';

export const checkActiveDefenseEntitlements = (
    payload: EntitlementAccessPayload,
    input: ActiveDefenseGateInput
): ActiveDefenseGateResult => {
    const tier = tierFromPayload(payload);
    const probe = (key: string) =>
        resolveSdkEntitlement({ payload, key: key as `features.${string}` }).enabled;

    if (!probe(ACTIVE_DEFENSE_ENTITLEMENT_KEYS.enabled)) {
        return {
            ok: false,
            tier,
            reason: 'feature_disabled',
            message: 'Active defense requires the Enterprise tier.',
            suggestedTier: 'enterprise',
        };
    }

    if (input.requestCanaryTokens && !probe(ACTIVE_DEFENSE_ENTITLEMENT_KEYS.canaryTokens)) {
        return {
            ok: false,
            tier,
            reason: 'canary_not_entitled',
            message: 'Canary tokens require the Enterprise tier.',
            suggestedTier: 'enterprise',
        };
    }

    if (input.requestDecoyData && !probe(ACTIVE_DEFENSE_ENTITLEMENT_KEYS.decoyData)) {
        return {
            ok: false,
            tier,
            reason: 'decoy_not_entitled',
            message: 'Decoy data generation requires the Enterprise tier.',
            suggestedTier: 'enterprise',
        };
    }

    // Entitled — but a defensive-deception action still demands explicit consent.
    if ((input.requestCanaryTokens || input.requestDecoyData) && input.adminConsent !== true) {
        return {
            ok: false,
            tier,
            reason: 'consent_required',
            message: 'Active-defense actions require explicit admin consent.',
        };
    }

    return { ok: true, tier };
};

export const tierFromActiveDefensePayload = tierFromPayload;
