import type { MarketplaceProviderId } from './provider';

export interface MarketplaceProviderFeeSchedule {
    providerId: MarketplaceProviderId;
    feeBps: number;
    processingHandledByProvider: boolean;
    payoutCadence: 'weekly' | 'monthly';
    displayFeePercent: number;
}

export const DEFAULT_MARKETPLACE_FEE_BPS = 1_000;

export const marketplaceProviderFees: Record<
    MarketplaceProviderId,
    MarketplaceProviderFeeSchedule
> = {
    freeblackmarket: {
        providerId: 'freeblackmarket',
        feeBps: 300,
        processingHandledByProvider: true,
        payoutCadence: 'weekly',
        displayFeePercent: 3,
    },
    blamazon: {
        providerId: 'blamazon',
        feeBps: 1_500,
        processingHandledByProvider: true,
        payoutCadence: 'weekly',
        displayFeePercent: 15,
    },
    'mayhem-marketplaze': {
        providerId: 'mayhem-marketplaze',
        feeBps: 1_200,
        processingHandledByProvider: true,
        payoutCadence: 'weekly',
        displayFeePercent: 12,
    },
    'antin-amazon': {
        providerId: 'antin-amazon',
        feeBps: 2_000,
        processingHandledByProvider: true,
        payoutCadence: 'monthly',
        displayFeePercent: 20,
    },
};

export function feeForProvider(providerId: MarketplaceProviderId): MarketplaceProviderFeeSchedule {
    return marketplaceProviderFees[providerId];
}

/** A fee override is a basis-point value in the inclusive range 0..10000 (0–100%). */
export function isValidFeeBps(bps: number): boolean {
    return Number.isInteger(bps) && bps >= 0 && bps <= 10_000;
}

/**
 * The effective commission rate for a listing: a per-listing override when it
 * is allowed (Phase 8 `creatorFeeOverride` flag) and valid, otherwise the
 * provider's scheduled rate. Pure — the caller supplies `overrideAllowed`.
 */
export function resolveListingFeeBps(
    providerId: MarketplaceProviderId,
    feeBpsOverride: number | undefined,
    overrideAllowed: boolean,
): number {
    const base = marketplaceProviderFees[providerId]?.feeBps ?? DEFAULT_MARKETPLACE_FEE_BPS;
    if (overrideAllowed && feeBpsOverride !== undefined && isValidFeeBps(feeBpsOverride)) {
        return feeBpsOverride;
    }
    return base;
}

export interface PlatformCommissionSplit {
    grossCents: number;
    feeCents: number;
    netCents: number;
    feeBps: number;
    providerId: MarketplaceProviderId;
}

// Single split used by every monetary flow Blackout records (tips, creator
// subs, gifts, tickets, boosts, paywalls). The provider is still merchant of
// record — this only computes the display/reconciliation breakdown.
export function computePlatformCommission(
    grossCents: number,
    providerId: MarketplaceProviderId = 'freeblackmarket',
    feeBpsOverride?: number
): PlatformCommissionSplit {
    if (!Number.isFinite(grossCents) || grossCents < 0 || !Number.isInteger(grossCents)) {
        throw new RangeError('grossCents must be a non-negative integer');
    }
    if (feeBpsOverride !== undefined && !isValidFeeBps(feeBpsOverride)) {
        throw new RangeError('feeBpsOverride must be an integer in 0..10000');
    }
    const schedule = marketplaceProviderFees[providerId];
    const feeBps = feeBpsOverride ?? schedule?.feeBps ?? DEFAULT_MARKETPLACE_FEE_BPS;
    const feeCents = Math.round((grossCents * feeBps) / 10_000);
    return {
        grossCents,
        feeCents,
        netCents: grossCents - feeCents,
        feeBps,
        providerId,
    };
}
