/**
 * Persona engine entitlement keys + per-tier quotas (OSS-manifest group G3).
 *
 * A single burner identity is free and fully functional. Paid tiers add a
 * persona ROSTER (compartmentalized identities) plus alias rotation —
 * substantive capability, never a gate on the same code path. The
 * entitlement system stores only booleans (see `entitlements/types.ts`), so
 * the quantitative roster limit lives in `PERSONA_QUOTAS` keyed by
 * `EntitlementTier`.
 */

import type { EntitlementKey, EntitlementTier } from '../entitlements/types';

export const PERSONA_ENTITLEMENT_KEYS = {
    enabled: 'features.persona.enabled',
    rotation: 'features.persona.rotation',
    compartments: 'features.persona.compartments',
} as const satisfies Record<string, EntitlementKey>;

export type PersonaEntitlementKey =
    (typeof PERSONA_ENTITLEMENT_KEYS)[keyof typeof PERSONA_ENTITLEMENT_KEYS];

export type PersonaQuotas = {
    /** Max simultaneous personas incl. the free burner. -1 = unlimited. */
    maxPersonas: number;
};

export const PERSONA_QUOTAS: Record<EntitlementTier, PersonaQuotas> = {
    free: { maxPersonas: 1 },
    pro: { maxPersonas: 8 },
    team: { maxPersonas: 32 },
    enterprise: { maxPersonas: -1 },
};

/**
 * Per-tier default boolean entitlements. A paid-plan switch is a one-line
 * change here, not a sweep across consumer code.
 */
export const PERSONA_TIER_ENTITLEMENTS: Record<
    EntitlementTier,
    Partial<Record<PersonaEntitlementKey, boolean>>
> = {
    free: {
        'features.persona.enabled': true,
    },
    pro: {
        'features.persona.enabled': true,
        'features.persona.rotation': true,
        'features.persona.compartments': true,
    },
    team: {
        'features.persona.enabled': true,
        'features.persona.rotation': true,
        'features.persona.compartments': true,
    },
    enterprise: {
        'features.persona.enabled': true,
        'features.persona.rotation': true,
        'features.persona.compartments': true,
    },
};
