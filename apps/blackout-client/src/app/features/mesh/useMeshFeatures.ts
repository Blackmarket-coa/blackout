/**
 * Hook surfacing the caller's mesh / offline-transport entitlements
 * (OSS-manifest G6). Mesh is enterprise-only and never default-on; lower tiers
 * get nothing here. Mirrors the other privacy-suite feature hooks.
 */

import { useMemo } from 'react';
import {
    MESH_ENTITLEMENT_KEYS,
    buildFullyUnlockedEntitlementPayload,
    type EntitlementAccessPayload,
    type EntitlementTier,
} from '@blackout/protocol';
import { resolveSdkEntitlement } from '@blackout/sdk';
import { betaUnlockAllEnabled } from '../../core/features/betaUnlock';

export type MeshFeaturesSnapshot = {
    tier: EntitlementTier;
    enabled: boolean;
    storeForward: boolean;
    peerSync: boolean;
};

const LOCKED_FALLBACK: EntitlementAccessPayload = {
    deploymentPreset: 'starter',
    deploymentPresetEntitlements: {},
    orgTier: 'free',
    planState: { tier: 'free', status: 'inactive', isPaid: false },
};

export const useMeshFeatures = (
    payload: EntitlementAccessPayload = betaUnlockAllEnabled()
        ? buildFullyUnlockedEntitlementPayload()
        : LOCKED_FALLBACK
): MeshFeaturesSnapshot =>
    useMemo(() => {
        const tier = payload.planState?.tier ?? payload.orgTier ?? 'free';
        const probe = (key: string) =>
            resolveSdkEntitlement({ payload, key: key as `features.${string}` }).enabled;
        return {
            tier,
            enabled: probe(MESH_ENTITLEMENT_KEYS.enabled),
            storeForward: probe(MESH_ENTITLEMENT_KEYS.storeForward),
            peerSync: probe(MESH_ENTITLEMENT_KEYS.peerSync),
        };
    }, [payload]);
