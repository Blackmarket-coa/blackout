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
