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
    providerId: MarketplaceProviderId = 'freeblackmarket'
): PlatformCommissionSplit {
    if (!Number.isFinite(grossCents) || grossCents < 0 || !Number.isInteger(grossCents)) {
        throw new RangeError('grossCents must be a non-negative integer');
    }
    const schedule = marketplaceProviderFees[providerId];
    const feeBps = schedule?.feeBps ?? DEFAULT_MARKETPLACE_FEE_BPS;
    const feeCents = Math.round((grossCents * feeBps) / 10_000);
    return {
        grossCents,
        feeCents,
        netCents: grossCents - feeCents,
        feeBps,
        providerId,
    };
}
