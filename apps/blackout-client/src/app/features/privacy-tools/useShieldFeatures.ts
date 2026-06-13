/**
 * Hook surfacing the caller's shield / visibility baseline (OSS-manifest G1).
 * Detection is free on every tier; this only reflects whether the baseline is
 * present (it can be disabled in a locked-down preset). Mirrors the other
 * privacy-suite feature hooks.
 */

import { useMemo } from 'react';
import {
    SHIELD_ENTITLEMENT_KEYS,
    buildFullyUnlockedEntitlementPayload,
    type EntitlementAccessPayload,
    type EntitlementTier,
} from '@blackout/protocol';
import { resolveSdkEntitlement } from '@blackout/sdk';
import { betaUnlockAllEnabled } from '../../core/features/betaUnlock';

export type ShieldFeaturesSnapshot = {
    tier: EntitlementTier;
    enabled: boolean;
};

const FREE_FALLBACK: EntitlementAccessPayload = {
    deploymentPreset: 'starter',
    deploymentPresetEntitlements: { 'features.shield.enabled': true },
    orgTier: 'free',
    planState: { tier: 'free', status: 'inactive', isPaid: false },
};

export const useShieldFeatures = (
    payload: EntitlementAccessPayload = betaUnlockAllEnabled()
        ? buildFullyUnlockedEntitlementPayload()
        : FREE_FALLBACK
): ShieldFeaturesSnapshot =>
    useMemo(() => {
        const tier = payload.planState?.tier ?? payload.orgTier ?? 'free';
        const enabled = resolveSdkEntitlement({
            payload,
            key: SHIELD_ENTITLEMENT_KEYS.enabled,
        }).enabled;
        return { tier, enabled };
    }, [payload]);
