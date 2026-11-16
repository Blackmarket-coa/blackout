/**
 * Privacy hardening entitlement keys (OSS-manifest group G2).
 *
 * Basic hardening is free and fully functional. Advanced per-user anonymity
 * is a `pro`-tier upgrade. Of its three capabilities only image perturbation
 * is built; anonymized (Tor) transport and decoy traffic have entitlement
 * keys and no implementation (HARDENING_CAPABILITY_IMPLEMENTED below).
 */

import type { EntitlementKey, EntitlementTier } from '../entitlements/types';

export const HARDENING_ENTITLEMENT_KEYS = {
    enabled: 'features.hardening.enabled',
    torTransport: 'features.hardening.torTransport',
    decoyTraffic: 'features.hardening.decoyTraffic',
    imagePerturbation: 'features.hardening.imagePerturbation',
} as const satisfies Record<string, EntitlementKey>;

export type HardeningEntitlementKey =
    typeof HARDENING_ENTITLEMENT_KEYS[keyof typeof HARDENING_ENTITLEMENT_KEYS];

/**
 * Whether the capability behind each hardening entitlement actually exists.
 *
 * An entitlement answers "does this plan grant it", which is not the same
 * question as "is it built". Image perturbation is real. Tor transport and
 * decoy cover traffic are assigned to paid tiers and have no implementation:
 * there is no SOCKS or onion-routing code and no cover-traffic generator
 * anywhere in the repository.
 *
 * Everything that tells a person about one of these capabilities reads this
 * map beside the entitlement: a status line (the Privacy pulse widget), a
 * purchase surface (what a marketplace listing says it unlocks), and the
 * SDK's hardening gate, which refuses a request for a capability that is not
 * built whatever the caller's tier. Saying, or implying by selling it, that
 * anonymized transport is available is a claim about network anonymity that
 * someone may decide what to say, and to whom, on the strength of.
 *
 * Flip a flag here only in the change that ships the capability, so that
 * shipping the code and making the claim are the same commit. See
 * TRANSMUTATION_NOTES.md §4 and docs/security/trust-claims-2026-11-16.md.
 */
export const HARDENING_CAPABILITY_IMPLEMENTED = {
    imagePerturbation: true,
    torTransport: false,
    decoyTraffic: false,
} as const;

export type HardeningCapability = keyof typeof HARDENING_CAPABILITY_IMPLEMENTED;

/**
 * Whether `key` is the entitlement to a hardening capability that is not
 * built. False for every other key, the hardening keys of built capabilities
 * included.
 */
export function isUnbuiltHardeningKey(key: string): boolean {
    for (const capability of Object.keys(
        HARDENING_CAPABILITY_IMPLEMENTED
    ) as HardeningCapability[]) {
        if (HARDENING_ENTITLEMENT_KEYS[capability] === key) {
            return !HARDENING_CAPABILITY_IMPLEMENTED[capability];
        }
    }
    return false;
}

/**
 * Per-tier default boolean entitlements. Free keeps basic hardening; `pro`
 * and above hold the keys of the advanced surface, two of which
 * (`torTransport`, `decoyTraffic`) grant nothing yet: see
 * HARDENING_CAPABILITY_IMPLEMENTED.
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
