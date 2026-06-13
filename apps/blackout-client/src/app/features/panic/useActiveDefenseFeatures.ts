/**
 * Hook surfacing the caller's effective active-defense entitlements
 * (OSS-manifest G5). Mirrors `data-transparency/useTransparencyFeatures.ts`.
 *
 * Active defense (canary tokens, decoy data) is enterprise-only and never
 * default-on; the lower tiers get nothing here. Panic-wipe is a separate free
 * baseline. Until a global entitlements atom lands in `core/`, the hook accepts
 * an optional payload and falls back to locked-out defaults.
 */

import { useMemo } from 'react';
import {
    ACTIVE_DEFENSE_ENTITLEMENT_KEYS,
    buildFullyUnlockedEntitlementPayload,
    type EntitlementAccessPayload,
    type EntitlementTier,
} from '@blackout/protocol';
import { resolveSdkEntitlement } from '@blackout/sdk';
import { betaUnlockAllEnabled } from '../../core/features/betaUnlock';

export type ActiveDefenseFeaturesSnapshot = {
    tier: EntitlementTier;
    enabled: boolean;
    canaryTokens: boolean;
    decoyData: boolean;
};

const LOCKED_FALLBACK: EntitlementAccessPayload = {
    deploymentPreset: 'starter',
    deploymentPresetEntitlements: {},
    orgTier: 'free',
    planState: { tier: 'free', status: 'inactive', isPaid: false },
};

export const useActiveDefenseFeatures = (
    payload: EntitlementAccessPayload = betaUnlockAllEnabled()
        ? buildFullyUnlockedEntitlementPayload()
        : LOCKED_FALLBACK
): ActiveDefenseFeaturesSnapshot =>
    useMemo(() => {
        const tier = payload.planState?.tier ?? payload.orgTier ?? 'free';
        const probe = (key: string) =>
            resolveSdkEntitlement({ payload, key: key as `features.${string}` }).enabled;
        return {
            tier,
            enabled: probe(ACTIVE_DEFENSE_ENTITLEMENT_KEYS.enabled),
            canaryTokens: probe(ACTIVE_DEFENSE_ENTITLEMENT_KEYS.canaryTokens),
            decoyData: probe(ACTIVE_DEFENSE_ENTITLEMENT_KEYS.decoyData),
        };
    }, [payload]);
