import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

/** Mirror of the API's `CreatorAnalyticsSummary` (GET /v1/telemetry/creator/summary). */
export interface CreatorInsightsSummary {
    days: number;
    streamViews: number;
    uniqueViewers: number;
    watchSeconds: number;
    clipPlays: number;
    peakConcurrentViewers: number;
    liveViewersNow: number | null;
}

export interface CreatorInsightsResponse {
    available: boolean;
    summary?: CreatorInsightsSummary;
}

/**
 * Creator-facing analytics aggregates. `available: false` means the deployment
 * runs without the analytics warehouse — callers hide the insights UI instead
 * of showing zeros that would read as "nobody watched".
 */
export const fetchCreatorInsights = async (days = 7): Promise<CreatorInsightsResponse> => {
    const client = createAuthorizedApiClient(readBlackoutApiToken());
    return client<CreatorInsightsResponse>({
        method: 'GET',
        path: `/v1/telemetry/creator/summary?days=${days}`,
    });
};
