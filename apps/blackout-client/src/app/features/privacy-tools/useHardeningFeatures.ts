/**
 * Hook surfacing the caller's effective privacy-hardening entitlements
 * (OSS-manifest G2). Mirrors `features/deaddrop/useDeadDropQuota.ts` /
 * `features/burner-identity/usePersonaQuota.ts`.
 *
 * `imagePerturbation` is the capability that is real today; `torTransport` and
 * `decoyTraffic` are surfaced for the upgrade affordance but remain planned.
 * Until a global entitlements atom lands in `core/`, the hook accepts an
 * optional payload and falls back to free-tier defaults.
 */

import { useMemo } from 'react';
import {
    HARDENING_ENTITLEMENT_KEYS,
    buildFullyUnlockedEntitlementPayload,
    type EntitlementAccessPayload,
    type EntitlementTier,
} from '@blackout/protocol';
import { resolveSdkEntitlement } from '@blackout/sdk';
import { betaUnlockAllEnabled } from '../../core/features/betaUnlock';

/**
 * Whether the capability behind each hardening entitlement actually exists.
 *
 * The entitlement booleans this hook returns answer "does this plan grant it",
 * which is not the same question as "is it running". Image perturbation is
 * real; Tor transport and decoy cover traffic are sold as part of the tier but
 * have no implementation — there is no SOCKS or onion-routing code in the
 * repo, and `@blackout/sdk`'s hardening gate records the same.
 *
 * Any surface that reports hardening *status* to a member must read this
 * alongside the entitlement, because reporting anonymized transport as active
 * is a claim about network anonymity that someone may decide what to say, and
 * to whom, on the strength of. Flip a flag here only in the change that ships
 * the capability. See TRANSMUTATION_NOTES.md §4.
 */
export const HARDENING_CAPABILITY_IMPLEMENTED = {
    imagePerturbation: true,
    torTransport: false,
    decoyTraffic: false,
} as const;

export type HardeningCapability = keyof typeof HARDENING_CAPABILITY_IMPLEMENTED;

export type HardeningFeaturesSnapshot = {
    tier: EntitlementTier;
    enabled: boolean;
    imagePerturbation: boolean;
    torTransport: boolean;
    decoyTraffic: boolean;
};

const FREE_FALLBACK: EntitlementAccessPayload = {
    deploymentPreset: 'starter',
    deploymentPresetEntitlements: {
        'features.hardening.enabled': true,
    },
    orgTier: 'free',
    planState: { tier: 'free', status: 'inactive', isPaid: false },
};

export const useHardeningFeatures = (
    payload: EntitlementAccessPayload = betaUnlockAllEnabled()
        ? buildFullyUnlockedEntitlementPayload()
        : FREE_FALLBACK
): HardeningFeaturesSnapshot =>
    useMemo(() => {
        const tier = payload.planState?.tier ?? payload.orgTier ?? 'free';
        const probe = (key: string) =>
            resolveSdkEntitlement({ payload, key: key as `features.${string}` }).enabled;
        return {
            tier,
            enabled: probe(HARDENING_ENTITLEMENT_KEYS.enabled),
            imagePerturbation: probe(HARDENING_ENTITLEMENT_KEYS.imagePerturbation),
            torTransport: probe(HARDENING_ENTITLEMENT_KEYS.torTransport),
            decoyTraffic: probe(HARDENING_ENTITLEMENT_KEYS.decoyTraffic),
        };
    }, [payload]);
