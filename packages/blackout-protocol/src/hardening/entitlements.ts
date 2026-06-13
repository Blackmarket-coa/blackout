/**
 * Privacy hardening entitlement keys (OSS-manifest group G2).
 *
 * Basic hardening is free and fully functional. Advanced per-user anonymity
 * (anonymized transport, decoy traffic, image perturbation) is a `pro`-tier
 * upgrade — substantive capability, never a gate on the same code path.
 */

import type { EntitlementKey, EntitlementTier } from '../entitlements/types';

export const HARDENING_ENTITLEMENT_KEYS = {
    enabled: 'features.hardening.enabled',
    torTransport: 'features.hardening.torTransport',
    decoyTraffic: 'features.hardening.decoyTraffic',
    imagePerturbation: 'features.hardening.imagePerturbation',
} as const satisfies Record<string, EntitlementKey>;

export type HardeningEntitlementKey =
    (typeof HARDENING_ENTITLEMENT_KEYS)[keyof typeof HARDENING_ENTITLEMENT_KEYS];

/**
 * Per-tier default boolean entitlements. Free keeps basic hardening; `pro`
 * and above unlock the advanced anonymity surface.
 */
export const HARDENING_TIER_ENTITLEMENTS: Record<
    EntitlementTier,
    Partial<Record<HardeningEntitlementKey, boolean>>
> = {
    free: {
        'features.hardening.enabled': true,
    },
    pro: {
        'features.hardening.enabled': true,
        'features.hardening.torTransport': true,
        'features.hardening.decoyTraffic': true,
        'features.hardening.imagePerturbation': true,
    },
    team: {
        'features.hardening.enabled': true,
        'features.hardening.torTransport': true,
        'features.hardening.decoyTraffic': true,
        'features.hardening.imagePerturbation': true,
    },
    enterprise: {
        'features.hardening.enabled': true,
        'features.hardening.torTransport': true,
        'features.hardening.decoyTraffic': true,
        'features.hardening.imagePerturbation': true,
    },
};
