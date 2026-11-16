/**
 * Tier-aware privacy-hardening entitlement checks.
 *
 * Mirrors `persona/entitlementGate.ts` and `deaddrop/entitlementGate.ts`: the
 * SDK refuses a hardening action that would violate the caller's entitlements
 * before it reaches the server, so the UI can surface a tier-upgrade prompt.
 *
 * Basic hardening (`enabled`) is free; image perturbation requires Pro or
 * higher. Tor transport and decoy traffic are not built
 * (HARDENING_CAPABILITY_IMPLEMENTED in `@blackout/protocol`), so a request for
 * either is refused for every tier, with a reason and a message that say so
 * and no tier to upgrade to: answering "requires the Pro tier" for a
 * capability no tier provides would sell something that does not exist, and
 * answering `ok` would let a caller go on as if its traffic were anonymized.
 * The entitlement checks for the two stay below for the change that builds
 * them.
 */

import {
    HARDENING_CAPABILITY_IMPLEMENTED,
    HARDENING_ENTITLEMENT_KEYS,
    type EntitlementAccessPayload,
    type EntitlementTier,
    type HardeningCapability,
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
    | 'decoy_not_entitled'
    | 'perturbation_not_implemented'
    | 'tor_not_implemented'
    | 'decoy_not_implemented';

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
                planState: {
                    ...payload.planState,
                    tier: TIER_ORDER[i],
                    status: 'active',
                    isPaid: true,
                },
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
        capability: HardeningCapability;
        key: string;
        reason: HardeningGateReason;
        message: string;
        /** What a request gets while the capability is not built. */
        unbuilt: { reason: HardeningGateReason; message: string };
    }> = [
        {
            want: input.requestPerturbation,
            capability: 'imagePerturbation',
            key: HARDENING_ENTITLEMENT_KEYS.imagePerturbation,
            reason: 'perturbation_not_entitled',
            message: 'Image perturbation requires the Pro tier or higher.',
            unbuilt: {
                reason: 'perturbation_not_implemented',
                message: 'Image perturbation is not built. No tier provides it.',
            },
        },
        {
            want: input.requestTorTransport,
            capability: 'torTransport',
            key: HARDENING_ENTITLEMENT_KEYS.torTransport,
            reason: 'tor_not_entitled',
            message: 'Anonymized transport requires the Pro tier or higher.',
            unbuilt: {
                reason: 'tor_not_implemented',
                message:
                    'Anonymized (Tor) transport is planned and not built yet. No tier provides it, and your traffic is not routed through Tor.',
            },
        },
        {
            want: input.requestDecoyTraffic,
            capability: 'decoyTraffic',
            key: HARDENING_ENTITLEMENT_KEYS.decoyTraffic,
            reason: 'decoy_not_entitled',
            message: 'Decoy traffic requires the Pro tier or higher.',
            unbuilt: {
                reason: 'decoy_not_implemented',
                message:
                    'Decoy traffic is planned and not built yet. No tier provides it, and no cover traffic is sent.',
            },
        },
    ];

    // A capability that is not built is refused first, for every tier: there
    // is nothing to be entitled to.
    for (const check of checks) {
        if (check.want && !HARDENING_CAPABILITY_IMPLEMENTED[check.capability]) {
            return {
                ok: false,
                tier,
                reason: check.unbuilt.reason,
                message: check.unbuilt.message,
            };
        }
    }

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
