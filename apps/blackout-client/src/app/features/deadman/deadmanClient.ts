import { createDeadmanActions } from '@blackout/sdk';
import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

/**
 * Thin facade that mirrors `governanceClient`/`profileClient` and binds
 * the canonical authorized API client to the SDK's deadman actions.
 *
 * The token is resolved per-call so re-authentication flips through
 * automatically without re-instantiating the actions object.
 */
export const createBoundDeadmanActions = (
    token: string | null = readBlackoutApiToken()
) => createDeadmanActions(createAuthorizedApiClient(token));
