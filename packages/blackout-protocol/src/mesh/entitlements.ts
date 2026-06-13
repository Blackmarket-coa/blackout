/**
 * Mesh / offline-transport entitlement keys (OSS-manifest group G6).
 *
 * Store-and-forward peer sync over local transports (Briar-class). Briar /
 * Bramble / Meshtastic are GPLv3 reference-only (manifest §4); the store-and-
 * forward gossip primitives shipped here are first-party greenfield. The
 * topology capability is gated to the `enterprise` tier.
 */

import type { EntitlementKey, EntitlementTier } from '../entitlements/types';

export const MESH_ENTITLEMENT_KEYS = {
    enabled: 'features.mesh.enabled',
    storeForward: 'features.mesh.storeForward',
    peerSync: 'features.mesh.peerSync',
} as const satisfies Record<string, EntitlementKey>;

export type MeshEntitlementKey =
    (typeof MESH_ENTITLEMENT_KEYS)[keyof typeof MESH_ENTITLEMENT_KEYS];

/** Mesh transport is an `enterprise`-only topology capability. */
export const MESH_TIER_ENTITLEMENTS: Record<
    EntitlementTier,
    Partial<Record<MeshEntitlementKey, boolean>>
> = {
    free: {},
    pro: {},
    team: {},
    enterprise: {
        'features.mesh.enabled': true,
        'features.mesh.storeForward': true,
        'features.mesh.peerSync': true,
    },
};
