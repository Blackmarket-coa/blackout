/**
 * Creator fee resolution (Phase 8).
 *
 * A creator listing may carry a per-listing commission override. It is only
 * honored when the default-off `creatorFeeOverride` flag is enabled; otherwise
 * the provider's scheduled rate applies. This is the single resolver the
 * creator-studio display and any commission readout should call.
 */

import {
    computePlatformCommission,
    resolveListingFeeBps,
    type MarketplaceProviderId,
    type PlatformCommissionSplit,
} from '@blackout/core';

/** Default-off gate. Flip `BLACKOUT_CREATOR_FEE_OVERRIDE=true` to enable. */
export function creatorFeeOverrideEnabled(): boolean {
    return process.env.BLACKOUT_CREATOR_FEE_OVERRIDE === 'true';
}

export function commissionForListing(
    grossCents: number,
    providerId: MarketplaceProviderId,
    feeBpsOverride?: number,
): PlatformCommissionSplit {
    const feeBps = resolveListingFeeBps(providerId, feeBpsOverride, creatorFeeOverrideEnabled());
    return computePlatformCommission(grossCents, providerId, feeBps);
}
