import { createFetchApiClient } from '@blackout/sdk';
import { API_BASE_URL } from '../app/sdk/apiBaseUrl';
import { restoreActiveSession, type StoredSession } from './sessionManager';
import { readBlackoutApiToken } from '../app/features/monetization/marketplace/useMarketplaceAuth';

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

/**
 * Dedupe slot for an in-flight exchange. Both the boot kick-off
 * (`exchangeMatrixForBlackoutToken`) and on-demand callers
 * (`ensureBlackoutApiToken`) await the same request so the invite flow never
 * races a second exchange, and a single failure isn't retried in a tight loop.
 */
let inFlightExchange: Promise<string | null> | null = null;

/**
 * Clock-skew margin (seconds) so a token about to expire is refreshed proactively
 * rather than firing one doomed request first.
 */
const TOKEN_EXPIRY_SKEW_SECONDS = 30;

/**
 * True when a Blackout API JWT is absent or (about to be) expired. Best-effort:
 * a token we can't parse is treated as expired, so the caller re-exchanges
 * rather than sending a known-dead credential that 401s in the browser console
 * before the SDK self-heals. Reads only the `exp` claim — signature
 * verification is the API's job, not the client's.
 */
export const isBlackoutTokenExpired = (token: string | null | undefined): boolean => {
    if (!token) return true;
    const payloadSegment = token.split('.')[1];
    if (!payloadSegment) return true;
    try {
        const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
        const exp = (JSON.parse(atob(padded)) as { exp?: number }).exp;
        if (typeof exp !== 'number') return true;
        return exp <= Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SKEW_SECONDS;
    } catch {
        return true;
    }
};

const writeToken = (token: string): void => {
    try {
        window.localStorage.setItem(BLACKOUT_API_TOKEN_KEY, token);
    } catch {
        // Storage can be unavailable (private mode / blocked); the API just
        // stays unauthenticated until the next successful exchange.
    }
};

export const clearBlackoutApiToken = (): void => {
    inFlightExchange = null;
    try {
        window.localStorage.removeItem(BLACKOUT_API_TOKEN_KEY);
    } catch {
        // ignore — nothing else to clean up
    }
};

/**
 * Perform the exchange against the API. The Matrix token is sent in
 * `x-matrix-access-token` (not `Authorization`) so it doesn't trip the JWT
 * bearer path in the API's authMiddleware. Resolves the minted JWT, or `null`
 * if the session has no token or the exchange fails.
 */
const runExchange = async (session: StoredSession): Promise<string | null> => {
    if (!session.accessToken) return null;

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
 */
export const ensureBlackoutApiToken = (
    session: StoredSession | null = restoreActiveSession(),
): Promise<string | null> => {
    const existing = readBlackoutApiToken();
    // Only reuse a cached token that is still valid. An expired one is skipped
    // (runExchange overwrites it) so we never send a known-dead credential.
    if (existing && !isBlackoutTokenExpired(existing)) return Promise.resolve(existing);

    if (!session) return Promise.resolve(null);

    if (!inFlightExchange) {
        inFlightExchange = runExchange(session).finally(() => {
            inFlightExchange = null;
        });
    }
    return inFlightExchange;
};

/**
 * Fire-and-forget boot kick-off: start the exchange early (right after sync
 * begins) so the token is usually ready by the time a feature needs it. Routes
 * through the same dedupe slot as `ensureBlackoutApiToken`, so an invite page
 * that awaits the token shares this request rather than starting a second one.
 */
export const exchangeMatrixForBlackoutToken = (session: StoredSession): void => {
    void ensureBlackoutApiToken(session);
};
