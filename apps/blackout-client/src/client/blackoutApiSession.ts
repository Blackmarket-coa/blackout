import { createFetchApiClient } from '@blackout/sdk';
import { API_BASE_URL } from '../app/sdk/client';
import type { StoredSession } from './sessionManager';

/**
 * localStorage key the Blackout API JWT lives under. Kept in sync with the
 * reader in
 * `app/features/monetization/marketplace/useMarketplaceAuth.ts` —
 * `readBlackoutApiToken()` reads this exact key.
 */
export const BLACKOUT_API_TOKEN_KEY = 'blackout.api.token';

interface MatrixExchangeResponse {
    token: string;
    refreshToken?: string;
    userId: string;
}

const writeToken = (token: string): void => {
    try {
        window.localStorage.setItem(BLACKOUT_API_TOKEN_KEY, token);
    } catch {
        // Storage can be unavailable (private mode / blocked); the API just
        // stays unauthenticated until the next successful exchange.
    }
};

export const clearBlackoutApiToken = (): void => {
    try {
        window.localStorage.removeItem(BLACKOUT_API_TOKEN_KEY);
    } catch {
        // ignore — nothing else to clean up
    }
};

/**
 * Exchange the active Matrix access token for a Blackout API JWT and persist
 * it. Best-effort: a failure here must not break chat/sync, so callers should
 * not await this on the critical boot path and we swallow errors after
 * logging. The Matrix token is sent in `x-matrix-access-token` (not
 * `Authorization`) so it doesn't trip the JWT bearer path in the API's
 * authMiddleware.
 */
export const exchangeMatrixForBlackoutToken = async (session: StoredSession): Promise<void> => {
    if (!session.accessToken) return;

    try {
        const client = createFetchApiClient({
            baseUrl: API_BASE_URL,
            defaultHeaders: { 'x-matrix-access-token': session.accessToken },
            defaultRetry: { attempts: 2, backoffMs: 150 },
        });
        const result = (await client({
            method: 'POST',
            path: '/v1/auth/matrix/exchange',
            body: {},
        })) as MatrixExchangeResponse;

        if (result?.token) {
            writeToken(result.token);
        }
    } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(
            '[blackout] could not exchange Matrix session for an API token; /v1 features will be unauthenticated until the next attempt.',
            error,
        );
    }
};
