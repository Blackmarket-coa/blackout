/**
 * Active-defense entitlement keys (OSS-manifest group G5).
 *
 * Panic-wipe / duress is a free personal-safety baseline (handled in the
 * `panic` module's `panic.wipe.trigger` capability). The keys here cover the
 * *defensive, local-only* deception primitives — canary tokens and decoy data
 * — which are gated to the `enterprise` tier and require explicit admin
 * consent at call time. Nothing offensive, retaliatory, or directed at third
 * parties is represented here (see ethics §4 in the manifest).
 */

import type { EntitlementKey, EntitlementTier } from '../entitlements/types';

export const ACTIVE_DEFENSE_ENTITLEMENT_KEYS = {
    enabled: 'features.activedefense.enabled',
    canaryTokens: 'features.activedefense.canaryTokens',
    decoyData: 'features.activedefense.decoyData',
} as const satisfies Record<string, EntitlementKey>;

export type ActiveDefenseEntitlementKey =
    (typeof ACTIVE_DEFENSE_ENTITLEMENT_KEYS)[keyof typeof ACTIVE_DEFENSE_ENTITLEMENT_KEYS];

/**
 * Active defense is an `enterprise`-only capability — the lower tiers get
 * nothing here (panic-wipe lives elsewhere and stays free). Even at
 * `enterprise`, the server additionally requires explicit admin consent before
 * minting canaries or decoys.
 */
export const ACTIVE_DEFENSE_TIER_ENTITLEMENTS: Record<
    EntitlementTier,
    Partial<Record<ActiveDefenseEntitlementKey, boolean>>
> = {
    free: {},
    pro: {},
    team: {},
    enterprise: {
        'features.activedefense.enabled': true,
        'features.activedefense.canaryTokens': true,
        'features.activedefense.decoyData': true,
    },
};
