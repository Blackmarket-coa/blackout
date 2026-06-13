/**
 * Hook surfacing the caller's effective transparency entitlements
 * (OSS-manifest G9). Mirrors `privacy-tools/useHardeningFeatures.ts`.
 *
 * `selfReport` and `warrantCanary` are free trust primitives; `auditExport`
 * (org-scoped) is a `team`+ capability surfaced for the upgrade affordance.
 * Until a global entitlements atom lands in `core/`, the hook accepts an
 * optional payload and falls back to free-tier defaults.
 */

import { useMemo } from 'react';
import {
    TRANSPARENCY_ENTITLEMENT_KEYS,
    buildFullyUnlockedEntitlementPayload,
    type EntitlementAccessPayload,
    type EntitlementTier,
} from '@blackout/protocol';
import { resolveSdkEntitlement } from '@blackout/sdk';
import { betaUnlockAllEnabled } from '../../core/features/betaUnlock';

export type TransparencyFeaturesSnapshot = {
    tier: EntitlementTier;
    enabled: boolean;
    selfReport: boolean;
    auditExport: boolean;
    warrantCanary: boolean;
};

const FREE_FALLBACK: EntitlementAccessPayload = {
    deploymentPreset: 'starter',
    deploymentPresetEntitlements: {
        'features.transparency.enabled': true,
        'features.transparency.selfReport': true,
        'features.transparency.warrantCanary': true,
    },
    orgTier: 'free',
    planState: { tier: 'free', status: 'inactive', isPaid: false },
};

export const useTransparencyFeatures = (
    payload: EntitlementAccessPayload = betaUnlockAllEnabled()
        ? buildFullyUnlockedEntitlementPayload()
        : FREE_FALLBACK
): TransparencyFeaturesSnapshot =>
    useMemo(() => {
        const tier = payload.planState?.tier ?? payload.orgTier ?? 'free';
        const probe = (key: string) =>
            resolveSdkEntitlement({ payload, key: key as `features.${string}` }).enabled;
        return {
            tier,
            enabled: probe(TRANSPARENCY_ENTITLEMENT_KEYS.enabled),
            selfReport: probe(TRANSPARENCY_ENTITLEMENT_KEYS.selfReport),
            auditExport: probe(TRANSPARENCY_ENTITLEMENT_KEYS.auditExport),
            warrantCanary: probe(TRANSPARENCY_ENTITLEMENT_KEYS.warrantCanary),
        };
    }, [payload]);
