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
        feeBps: 1_000,
        processingHandledByProvider: true,
        payoutCadence: 'weekly',
        displayFeePercent: 10,
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
