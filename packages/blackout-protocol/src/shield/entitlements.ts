/**
 * Shield / visibility entitlement keys (OSS-manifest group G1).
 *
 * Tracker / fingerprint / leak *detection* is a free baseline capability — it
 * surfaces information and never blocks or modifies third-party behavior, so
 * every tier gets it. The capability is still default-off behind the
 * `shieldVisibility` flag + `shield.scan.run` capability; this key lets the
 * shell confirm the baseline is present.
 */

import type { EntitlementKey, EntitlementTier } from '../entitlements/types';

export const SHIELD_ENTITLEMENT_KEYS = {
    enabled: 'features.shield.enabled',
} as const satisfies Record<string, EntitlementKey>;

export type ShieldEntitlementKey =
    (typeof SHIELD_ENTITLEMENT_KEYS)[keyof typeof SHIELD_ENTITLEMENT_KEYS];

/** Free baseline: shield/visibility detection is available on every tier. */
export const SHIELD_TIER_ENTITLEMENTS: Record<
    EntitlementTier,
    Partial<Record<ShieldEntitlementKey, boolean>>
> = {
    free: { 'features.shield.enabled': true },
    pro: { 'features.shield.enabled': true },
    team: { 'features.shield.enabled': true },
    enterprise: { 'features.shield.enabled': true },
};
