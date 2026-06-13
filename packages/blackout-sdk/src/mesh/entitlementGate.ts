/**
 * Tier-aware mesh / offline-transport entitlement checks (OSS-manifest G6).
 *
 * Mesh store-and-forward is an `enterprise`-only topology capability; peer sync
 * is a sub-capability surfaced for the upgrade affordance. Mirrors the other
 * SDK entitlement gates.
 */

import {
    MESH_ENTITLEMENT_KEYS,
    type EntitlementAccessPayload,
    type EntitlementTier,
} from '@blackout/protocol';
import { resolveSdkEntitlement } from '../entitlements';

export type MeshGateInput = {
    requestPeerSync?: boolean;
};

export type MeshGateReason = 'feature_disabled' | 'sync_not_entitled';

export type MeshGateResult =
    | { ok: true; tier: EntitlementTier }
    | {
          ok: false;
          tier: EntitlementTier;
          reason: MeshGateReason;
          message: string;
          suggestedTier?: EntitlementTier;
      };

const tierFromPayload = (payload: EntitlementAccessPayload): EntitlementTier =>
    payload.planState?.tier ?? payload.orgTier ?? 'free';

export const checkMeshEntitlements = (
    payload: EntitlementAccessPayload,
    input: MeshGateInput = {}
): MeshGateResult => {
    const tier = tierFromPayload(payload);
    const probe = (key: string) =>
        resolveSdkEntitlement({ payload, key: key as `features.${string}` }).enabled;

    if (!probe(MESH_ENTITLEMENT_KEYS.enabled)) {
        return {
            ok: false,
            tier,
            reason: 'feature_disabled',
            message: 'Mesh / offline transport requires the Enterprise tier.',
            suggestedTier: 'enterprise',
        };
    }

    if (input.requestPeerSync && !probe(MESH_ENTITLEMENT_KEYS.peerSync)) {
        return {
            ok: false,
            tier,
            reason: 'sync_not_entitled',
            message: 'Mesh peer sync requires the Enterprise tier.',
            suggestedTier: 'enterprise',
        };
    }

    return { ok: true, tier };
};

export const tierFromMeshPayload = tierFromPayload;
