import { createFetchApiClient } from '@blackout/sdk';
import { API_BASE_URL } from '../app/sdk/apiBaseUrl';
import { restoreActiveSession, type StoredSession } from './sessionManager';
import { clearBlackoutApiToken as clearMarketAuthToken, setBlackoutApiToken } from '../app/features/monetization/marketplace/useMarketplaceAuth';

/**
 * HTTP-only cookie flag: set to true when the server is configured with
 * AUTH_TOKEN_TRANSPORT=cookie or AUTH_TOKEN_TRANSPORT=both, which means
 * the JWT is stored in a httpOnly cookie and sent automatically with
 * credentials: 'include'. When false, fall back to the Authorization
 * Bearer header from the exchange response.
 */
const USE_COOKIE_TRANSPORT = false;

/**
 * Dedupe slot for an in-flight exchange. Both the boot kick-off
 * (`exchangeMatrixForBlackoutToken`) and on-demand callers
 * (`ensureBlackoutApiToken`) await the same request so the invite flow never
 * races a second exchange, and a single failure isn't retried in a tight loop.
 */
let inFlightExchange: Promise<string | null> | null = null;

let cachedBearer: string | null = null;

interface MatrixExchangeResponse {
    token: string;
    refreshToken?: string;
    userId: string;
}

/**
 * Perform the exchange against the API. The Matrix token is sent in
 * `x-matrix-access-token` (not `Authorization`) so it doesn't trip the JWT
 * bearer path in the API's authMiddleware. Resolves the minted JWT, or `null`
 * if the session has no token or the exchange fails.
 *
 * When cookie transport is active the server sets a httpOnly cookie and the
 * returned JWT is only needed as a fallback; the cookie is sent automatically
 * on subsequent requests with `credentials: 'include'`.
 */
const runExchange = async (session: StoredSession): Promise<string | null> => {
    if (!session.accessToken) return null;

    try {
        const client = createFetchApiClient({
            baseUrl: API_BASE_URL,
            defaultHeaders: { 'x-matrix-access-token': session.accessToken },
            credentials: 'include',
            defaultRetry: { attempts: 2, backoffMs: 150 },
        });
        const result = (await client({
            method: 'POST',
            path: '/v1/auth/matrix/exchange',
            body: {},
        })) as MatrixExchangeResponse;

        if (result?.token) {
            cachedBearer = result.token;
            setBlackoutApiToken(result.token);
            return result.token;
        }
        return null;
    } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(
            '[blackout] could not exchange Matrix session for an API token; /v1 features will be unauthenticated until the next attempt.',
            error,
        );
        return null;
    }
};

/**
 * Resolve a usable Blackout API JWT, performing the Matrix→Blackout exchange
 * if one isn't cached yet. Returns the existing token immediately when present;
 * otherwise dedupes onto a single in-flight exchange so concurrent callers
 * (boot, invite redeem, marketplace) share one round-trip. Resolves `null` if
 * there's no active Matrix session or the exchange fails — callers decide
 * whether to proceed unauthenticated.
 *
 * When cookie transport is active (USE_COOKIE_TRANSPORT), the JWT is stored
 * in a httpOnly cookie so we skip the in-memory cache and return null to
 * indicate "use credentials: 'include'" — the cookie is sent automatically.
 */
export const ensureBlackoutApiToken = (
    session: StoredSession | null = restoreActiveSession(),
): Promise<string | null> => {
    if (USE_COOKIE_TRANSPORT) return Promise.resolve(null);

    const existing = cachedBearer;
    if (existing) return Promise.resolve(existing);

    if (!session) return Promise.resolve(null);

    if (!inFlightExchange) {
        inFlightExchange = runExchange(session).finally(() => {
            inFlightExchange = null;
        });
    }
    return inFlightExchange;
};

export const clearBlackoutApiToken = (): void => {
    inFlightExchange = null;
    cachedBearer = null;
    clearMarketAuthToken();
};

export const readBlackoutApiToken = (): string | null => cachedBearer;

/**
 * Fire-and-forget boot kick-off: start the exchange early (right after sync
 * begins) so the token is usually ready by the time a feature needs it. Routes
 * through the same dedupe slot as `ensureBlackoutApiToken`, so an invite page
 * that awaits the token shares this request rather than starting a second one.
 */
export const exchangeMatrixForBlackoutToken = (session: StoredSession): void => {
    void ensureBlackoutApiToken(session);
};
