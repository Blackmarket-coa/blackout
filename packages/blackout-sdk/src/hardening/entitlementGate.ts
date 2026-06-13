/**
 * Tier-aware privacy-hardening entitlement checks.
 *
 * Mirrors `persona/entitlementGate.ts` and `deaddrop/entitlementGate.ts`: the
 * SDK refuses a hardening action that would violate the caller's entitlements
 * before it reaches the server, so the UI can surface a tier-upgrade prompt.
 *
 * Basic hardening (`enabled`) is free; advanced anonymity surfaces
 * (image perturbation, and the still-planned Tor transport / decoy traffic)
 * require Pro or higher.
 */

import {
    HARDENING_ENTITLEMENT_KEYS,
    type EntitlementAccessPayload,
    type EntitlementTier,
} from '@blackout/protocol';
import { resolveSdkEntitlement } from '../entitlements';

export type HardeningGateInput = {
    requestPerturbation?: boolean;
    requestTorTransport?: boolean;
    requestDecoyTraffic?: boolean;
};

export type HardeningGateReason =
    | 'feature_disabled'
    | 'perturbation_not_entitled'
    | 'tor_not_entitled'
    | 'decoy_not_entitled';

export type HardeningGateResult =
    | { ok: true; tier: EntitlementTier }
    | {
          ok: false;
          tier: EntitlementTier;
          reason: HardeningGateReason;
          message: string;
          suggestedTier?: EntitlementTier;
      };

const TIER_ORDER: readonly EntitlementTier[] = ['free', 'pro', 'team', 'enterprise'];

const tierFromPayload = (payload: EntitlementAccessPayload): EntitlementTier =>
    payload.planState?.tier ?? payload.orgTier ?? 'free';

/** First higher tier that grants the given boolean entitlement. */
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

export const checkHardeningEntitlements = (
    payload: EntitlementAccessPayload,
    input: HardeningGateInput
): HardeningGateResult => {
    const tier = tierFromPayload(payload);
    const probe = (key: string) =>
        resolveSdkEntitlement({ payload, key: key as `features.${string}` }).enabled;

    if (!probe(HARDENING_ENTITLEMENT_KEYS.enabled)) {
        return {
            ok: false,
            tier,
            reason: 'feature_disabled',
            message: 'Privacy hardening is not enabled for your account.',
            suggestedTier: suggestTier(payload, HARDENING_ENTITLEMENT_KEYS.enabled, tier),
        };
    }

    const checks: ReadonlyArray<{
        want: boolean | undefined;
        key: string;
        reason: HardeningGateReason;
        message: string;
    }> = [
        {
            want: input.requestPerturbation,
            key: HARDENING_ENTITLEMENT_KEYS.imagePerturbation,
            reason: 'perturbation_not_entitled',
            message: 'Image perturbation requires the Pro tier or higher.',
        },
        {
            want: input.requestTorTransport,
            key: HARDENING_ENTITLEMENT_KEYS.torTransport,
            reason: 'tor_not_entitled',
            message: 'Anonymized transport requires the Pro tier or higher.',
        },
        {
            want: input.requestDecoyTraffic,
            key: HARDENING_ENTITLEMENT_KEYS.decoyTraffic,
            reason: 'decoy_not_entitled',
            message: 'Decoy traffic requires the Pro tier or higher.',
        },
    ];

    for (const check of checks) {
        if (check.want && !probe(check.key)) {
            return {
                ok: false,
                tier,
                reason: check.reason,
                message: check.message,
                suggestedTier: suggestTier(payload, check.key, tier) ?? 'pro',
            };
        }
    }

    return { ok: true, tier };
};

export const tierFromHardeningPayload = tierFromPayload;
