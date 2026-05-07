import { createAuthorizedApiClient } from '../../../sdk/client';
import { readBlackoutApiToken } from '../../monetization/marketplace/useMarketplaceAuth';

/**
 * Frontend wrapper for /v1/integrations/streamlabs/sync. Mirrors
 * packages/api/src/routes/streamlabs.ts — keep the shapes in sync.
 */

export interface SyncDonationsResponse {
    ok: true;
    /** Number of new donations pulled in this sync (i.e. past the persisted cursor). */
    newDonations: number;
    /** Number of widget subscribers each new donation was delivered to. */
    delivered: number;
    /** Largest donation_id seen this sync; persists as the new cursor. */
    latestDonationId?: string;
}

export interface ApiCallOptions {
    token?: string | null;
    apiClient?: ReturnType<typeof createAuthorizedApiClient>;
}

const client = (options?: ApiCallOptions) =>
    options?.apiClient ?? createAuthorizedApiClient(options?.token ?? readBlackoutApiToken());

const SYNC_PATH = '/v1/integrations/streamlabs/sync';

export const syncStreamlabsDonations = (
    options?: ApiCallOptions,
): Promise<SyncDonationsResponse> =>
    client(options)({ method: 'POST', path: SYNC_PATH }) as Promise<SyncDonationsResponse>;
