/**
 * Tier → feature-key bundles: the canonical map from a subscription tier to the
 * full set of `features.*` entitlement keys it grants.
 *
 * This is the System B (plan-tier) half of the marketplace bridge. When a
 * subscription-tier listing settles, its bundle is fanned out into individual
 * entitlement grants so every gated feature/widget lights up. The bundle is
 * composed from the per-family tier tables that already define the tiering —
 * this module never re-declares which key belongs to which tier, it only
 * unions the `true` keys across families for a given tier.
 */

import { DEAD_DROP_TIER_ENTITLEMENTS } from '../deaddrop/entitlements';
import { PERSONA_TIER_ENTITLEMENTS } from '../persona/entitlements';
import { HARDENING_TIER_ENTITLEMENTS } from '../hardening/entitlements';
import { TRANSPARENCY_TIER_ENTITLEMENTS } from '../transparency/entitlements';
import { ACTIVE_DEFENSE_TIER_ENTITLEMENTS } from '../activedefense/entitlements';
import { SHIELD_TIER_ENTITLEMENTS } from '../shield/entitlements';
import { MESH_TIER_ENTITLEMENTS } from '../mesh/entitlements';
import type { EntitlementKey, EntitlementTier } from './types';
import type { ConsumerTier } from './consumerTiers';
import { toEntitlementTier } from './consumerTiers';

type TierTable = Record<EntitlementTier, Partial<Record<EntitlementKey, boolean>>>;

/**
 * Every family tier table. Casting is safe: each family's key type is a subset
 * of `EntitlementKey` and the shape is identical (`Record<tier, {key: bool}>`).
 */
const FAMILY_TIER_TABLES: TierTable[] = [
    DEAD_DROP_TIER_ENTITLEMENTS as TierTable,
    PERSONA_TIER_ENTITLEMENTS as TierTable,
    HARDENING_TIER_ENTITLEMENTS as TierTable,
    TRANSPARENCY_TIER_ENTITLEMENTS as TierTable,
    ACTIVE_DEFENSE_TIER_ENTITLEMENTS as TierTable,
    SHIELD_TIER_ENTITLEMENTS as TierTable,
    MESH_TIER_ENTITLEMENTS as TierTable,
];

function unionEnabledKeys(tier: EntitlementTier): EntitlementKey[] {
    const keys = new Set<EntitlementKey>();
    for (const table of FAMILY_TIER_TABLES) {
        const familyForTier = table[tier];
        if (!familyForTier) continue;
        for (const [key, enabled] of Object.entries(familyForTier)) {
            if (enabled) keys.add(key as EntitlementKey);
        }
    }
    return [...keys].sort();
}

/**
 * The full `features.*` bundle each internal tier grants, composed once at
 * module load. A higher tier is a strict superset of the lower ones by
 * construction of the family tables.
 */
export const TIER_FEATURE_BUNDLES: Record<EntitlementTier, EntitlementKey[]> = {
    free: unionEnabledKeys('free'),
    pro: unionEnabledKeys('pro'),
    team: unionEnabledKeys('team'),
    enterprise: unionEnabledKeys('enterprise'),
};

/** The feature-key bundle a consumer/internal tier grants. */
export function resolveTierBundle(tier: ConsumerTier | EntitlementTier): EntitlementKey[] {
    const entitlementTier: EntitlementTier =
        tier === 'free' || tier === 'pro' || tier === 'team' || tier === 'enterprise'
            ? tier
            : toEntitlementTier(tier);
    return TIER_FEATURE_BUNDLES[entitlementTier];
}

/**
 * Resolve the feature keys a listing grants: prefer the listing's explicit
 * `featureKeys`; otherwise, if it is a subscription-tier listing carrying a
 * tier in metadata, fall back to that tier's bundle. Returns `[]` for pure
 * artifact goods that grant no `features.*` keys.
 */
export function resolveListingFeatureKeys(listing: {
    featureKeys?: string[];
    entitlementKind?: string;
    metadata?: Record<string, unknown> | null;
}): EntitlementKey[] {
    const explicit = (listing.featureKeys ?? []).filter(
        (k): k is EntitlementKey => typeof k === 'string' && k.startsWith('features.')
    );
    if (explicit.length > 0) return explicit;

    if (listing.entitlementKind === 'subscription_tier') {
        const tier = listing.metadata?.tier ?? listing.metadata?.blackout_tier;
        if (tier === 'free' || tier === 'pro' || tier === 'team' || tier === 'enterprise') {
            return resolveTierBundle(tier);
        }
        if (tier === 'signal' || tier === 'coalition' || tier === 'sovereign') {
            return resolveTierBundle(tier);
        }
    }
    return [];
}
