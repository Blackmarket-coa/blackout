import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

export interface CoalitionCreditsPendingPayout {
    /** ISO 4217 currency code OR "CC" for Coalition Credits. */
    currency: string;
    amountMinorUnits: number;
    expectedSettlementAt: string | null;
}

export interface CoalitionCreditsRewardEligibility {
    programKey: string;
    eligible: boolean;
}

/** Mirror of the API's `GET /v1/coalition-credits` envelope. */
export interface CoalitionCreditsResponse {
    available: boolean;
    balanceMinorUnits?: number;
    currency?: string;
    pendingPayouts?: CoalitionCreditsPendingPayout[];
    rewardEligibility?: CoalitionCreditsRewardEligibility[];
}

/**
 * Coalition Credits standing for the signed-in creator. `available: false`
 * means the FBM entitlements service isn't configured on this deployment (or a
 * live call failed) — callers hide the panel instead of rendering a zero
 * balance that would read as "you've earned nothing".
 */
export const fetchCoalitionCredits = async (): Promise<CoalitionCreditsResponse> => {
    const client = createAuthorizedApiClient(readBlackoutApiToken());
    return client<CoalitionCreditsResponse>({
        method: 'GET',
        path: '/v1/coalition-credits',
    });
};
