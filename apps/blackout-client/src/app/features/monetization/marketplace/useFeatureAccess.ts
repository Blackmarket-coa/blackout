/**
 * Resolves whether the caller already holds a given `features.*` entitlement
 * key, so a monetization surface can collapse its "Buy" CTA to "Included in
 * your access" without a separate lookup. Two sources are unioned:
 *
 *   1. Plan/tier entitlements (System B) — resolved from the effective
 *      entitlement payload, beta-unlock aware (mirrors `useHardeningFeatures`).
 *      Under beta-unlock every key resolves true, which is what keeps the paid
 *      and pre-launch paths on one code path: the CTA auto-collapses.
 *   2. Marketplace grants (System A) — feature keys carried on entitlements the
 *      user already purchased/subscribed to (a subscription bundle, an
 *      individual item), so a fresh purchase is reflected immediately.
 *
 * There is no global entitlements atom in `core/` yet; until one lands the
 * plan-tier source falls back to free-tier defaults (same contract as the
 * per-family privacy hooks).
 */

import { useMemo } from 'react';
import type { NormalizedEntitlement } from '@blackout/core';
import {
    buildFullyUnlockedEntitlementPayload,
    type EntitlementAccessPayload,
    type EntitlementKey,
} from '@blackout/protocol';
import { resolveSdkEntitlement } from '@blackout/sdk';
import { betaUnlockAllEnabled } from '../../../core/features/betaUnlock';

const FREE_FALLBACK: EntitlementAccessPayload = {
    deploymentPreset: 'starter',
    deploymentPresetEntitlements: {},
    orgTier: 'free',
    planState: { tier: 'free', status: 'inactive', isPaid: false },
};

export interface FeatureAccess {
    /** True when the caller already holds this `features.*` key. */
    hasFeature: (key: string) => boolean;
    /**
     * True when the caller holds every key in the set. An empty set means the
     * item grants no `features.*` keys (a pure artifact good), so this returns
     * false — such an item is never "included," it is bought outright.
     */
    hasAllFeatures: (keys: readonly string[] | undefined) => boolean;
}

/**
 * @param ownedEntitlements marketplace entitlements the user already holds;
 *   their `featureKeys` are folded into the granted set.
 * @param payload optional plan-tier payload override (tests / SSR).
 */
export function useFeatureAccess(
    ownedEntitlements: readonly NormalizedEntitlement[] = [],
    payload: EntitlementAccessPayload = betaUnlockAllEnabled()
        ? buildFullyUnlockedEntitlementPayload()
        : FREE_FALLBACK
): FeatureAccess {
    const grantedFromMarketplace = useMemo(() => {
        const set = new Set<string>();
        for (const ent of ownedEntitlements) {
            if (ent.status !== 'granted') continue;
            for (const key of ent.featureKeys ?? []) set.add(key);
        }
        return set;
    }, [ownedEntitlements]);

    return useMemo(() => {
        const hasFeature = (key: string): boolean => {
            if (grantedFromMarketplace.has(key)) return true;
            if (!key.startsWith('features.')) return false;
            return resolveSdkEntitlement({ payload, key: key as EntitlementKey }).enabled;
        };
        const hasAllFeatures = (keys: readonly string[] | undefined): boolean => {
            if (!keys || keys.length === 0) return false;
            return keys.every(hasFeature);
        };
        return { hasFeature, hasAllFeatures };
    }, [grantedFromMarketplace, payload]);
}
