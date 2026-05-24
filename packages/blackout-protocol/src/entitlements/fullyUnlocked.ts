/**
 * Beta-testing override: a fully-unlocked entitlement payload.
 *
 * Returns an enterprise-tier, paid payload with every known feature key
 * enabled. Used behind the `BLACKOUT_BETA_UNLOCK_ALL` flag so beta testers can
 * exercise every service regardless of subscription. This is the single source
 * of truth for "fully unlocked" — when the payment-gating strategy is revised,
 * the gates change, not this enumeration.
 */

import { DEAD_DROP_TIER_ENTITLEMENTS } from '../deaddrop/entitlements';
import type { EntitlementAccessPayload, EntitlementMap } from './types';

const FULLY_UNLOCKED_ENTITLEMENTS: EntitlementMap = {
    'features.stego.enabled': true,
    'features.stego.ephemeral': true,
    'features.governance.entitlements': true,
    'features.canopy.premium': true,
    'features.canopy.priority_support': true,
    ...DEAD_DROP_TIER_ENTITLEMENTS.enterprise,
};

export function buildFullyUnlockedEntitlementPayload(): EntitlementAccessPayload {
    const entitlements: EntitlementMap = { ...FULLY_UNLOCKED_ENTITLEMENTS };
    return {
        deploymentPreset: 'sovereignty',
        deploymentPresetEntitlements: entitlements,
        orgTier: 'enterprise',
        orgTierEntitlements: entitlements,
        planState: {
            tier: 'enterprise',
            status: 'active',
            isPaid: true,
        },
    };
}
