/**
 * Consumer-facing tier ladder — the single branded vocabulary the marketplace
 * and billing surfaces show to users. It unifies the three tier vocabularies
 * that already exist in the ecosystem:
 *
 *   - Blackout `EntitlementTier`  (`free | pro | team | enterprise`)
 *   - product tiers in `docs/oss_manifest_packaging.md`
 *     (`Starter | Governance | Sovereignty`)
 *   - FBM Blackout-tier (`signal | signal_plus | community`)
 *
 * Everything internal still resolves through `EntitlementTier`; this module is
 * the display + mapping layer so renaming the ladder is a one-file change.
 */

import type { EntitlementTier } from './types';

export const CONSUMER_TIERS = ['free', 'signal', 'coalition', 'sovereign'] as const;

export type ConsumerTier = typeof CONSUMER_TIERS[number];

/** FBM's Blackout-tier vocabulary (mirrors `BLACKOUT_SUBSCRIPTION_TIERS`). */
export type FbmBlackoutTier = 'signal' | 'signal_plus' | 'community';

interface ConsumerTierDef {
    id: ConsumerTier;
    displayName: string;
    /** Canonical internal tier this consumer tier resolves to. */
    entitlementTier: EntitlementTier;
    /** Product-tier name used in the packaging spec. */
    productTier: 'Free' | 'Starter' | 'Governance' | 'Sovereignty';
    /** FBM Blackout-tier this consumer tier maps to (null for Free). */
    fbmTier: FbmBlackoutTier | null;
    /** Short marketing blurb for the tier card. */
    tagline: string;
}

export const CONSUMER_TIER_DEFS: Record<ConsumerTier, ConsumerTierDef> = {
    free: {
        id: 'free',
        displayName: 'Free',
        entitlementTier: 'free',
        productTier: 'Free',
        fbmTier: null,
        tagline: 'Baseline private, encrypted communication for everyone.',
    },
    signal: {
        id: 'signal',
        displayName: 'Signal',
        entitlementTier: 'pro',
        productTier: 'Starter',
        fbmTier: 'signal',
        tagline: 'Advanced per-person privacy: anonymized transport, persona roster, hardening.',
    },
    coalition: {
        id: 'coalition',
        displayName: 'Coalition',
        entitlementTier: 'team',
        productTier: 'Governance',
        fbmTier: 'signal_plus',
        tagline: 'Shared governance, org transparency, and coalition tooling for groups.',
    },
    sovereign: {
        id: 'sovereign',
        displayName: 'Sovereign',
        entitlementTier: 'enterprise',
        productTier: 'Sovereignty',
        fbmTier: 'community',
        tagline: 'Self-hosting, mesh transport, federation policy, and active defense.',
    },
};

const ENTITLEMENT_TO_CONSUMER: Record<EntitlementTier, ConsumerTier> = {
    free: 'free',
    pro: 'signal',
    team: 'coalition',
    enterprise: 'sovereign',
};

/** The canonical internal tier a consumer tier resolves to. */
export function toEntitlementTier(tier: ConsumerTier): EntitlementTier {
    return CONSUMER_TIER_DEFS[tier].entitlementTier;
}

/** The consumer tier for a canonical internal tier. */
export function fromEntitlementTier(tier: EntitlementTier): ConsumerTier {
    return ENTITLEMENT_TO_CONSUMER[tier];
}

/**
 * Resolve an FBM Blackout-tier (or arbitrary upstream string) to a consumer
 * tier. Unknown values fall back to `signal`, matching FBM's own default in
 * `mapSubscriptionTier()` (the lowest paid rung, never `free`).
 */
export function fromFbmTier(raw: unknown): ConsumerTier {
    switch (raw) {
        case 'community':
            return 'sovereign';
        case 'signal_plus':
            return 'coalition';
        case 'signal':
            return 'signal';
        default:
            return 'signal';
    }
}

/** Human-readable name for a consumer tier. */
export function displayName(tier: ConsumerTier): string {
    return CONSUMER_TIER_DEFS[tier].displayName;
}

/** Type guard for the consumer-tier union. */
export function isConsumerTier(value: unknown): value is ConsumerTier {
    return typeof value === 'string' && (CONSUMER_TIERS as readonly string[]).includes(value);
}
