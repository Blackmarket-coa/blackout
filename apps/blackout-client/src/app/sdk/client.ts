import { createClientQueries, createFetchApiClient, createMediaClient } from '@blackout/sdk';
import type { ApiClient, ApiRequest } from '@blackout/sdk';
import { BlackoutSdkError } from '@blackout/sdk';
import { API_BASE_URL } from './apiBaseUrl';
import {
    clearBlackoutApiToken,
    ensureBlackoutApiToken,
} from '../../client/blackoutApiSession';

// Re-export so existing importers (`import { API_BASE_URL } from '.../sdk/client'`)
// keep working after the base URL moved to its own (cycle-free) module.
export { API_BASE_URL };

const apiClient = createFetchApiClient({
    baseUrl: API_BASE_URL,
    defaultRetry: {
        attempts: 3,
        backoffMs: 100,
    },
});

export const clientQueries = createClientQueries(apiClient);

export const mediaClient = createMediaClient({
    defaultRetry: {
        attempts: 3,
        backoffMs: 120,
    },
});

const buildClient = (token: string | null): ApiClient =>
    createFetchApiClient({
        baseUrl: API_BASE_URL,
        defaultHeaders: token ? { authorization: `Bearer ${token}` } : undefined,
        defaultRetry: {
            attempts: 3,
            backoffMs: 100,
        },
    });

const isUnauthorized = (err: unknown): boolean =>
    err instanceof BlackoutSdkError && err.status === 401;

/**
 * Client for Blackout-JWT-authorized `/v1/*` calls. Two robustness behaviors
 * on top of the raw fetch client:
 *
 *  1. **Token readiness** — if no usable token is supplied, resolve one via
 *     `ensureBlackoutApiToken()` (awaits the in-flight Matrix→Blackout
 *     exchange). This removes the race where a feature mounts on
 *     `authState === 'logged_in'` before the fire-and-forget exchange has
 *     written the JWT, without blocking chat on the API.
 *  2. **Expiry/refresh** — on a 401 (the 24h JWT expired, or a stale token was
 *     passed), clear the cached token, re-exchange, and retry once.
 *
 * `token` stays in the signature for back-compat with callers that pass
 * `readBlackoutApiToken()`; pass `null` to always resolve lazily.
 */
export const createAuthorizedApiClient = (token: string | null): ApiClient => {
    const run = async <TResponse>(request: ApiRequest): Promise<TResponse> => {
        const current = token ?? (await ensureBlackoutApiToken());
        try {
            return (await buildClient(current)(request)) as TResponse;
        } catch (err) {
            if (!isUnauthorized(err)) throw err;
            // Token rejected (expired/stale/race) — re-mint and retry once.
            clearBlackoutApiToken();
            const fresh = await ensureBlackoutApiToken();
            if (!fresh || fresh === current) throw err;
            return (await buildClient(fresh)(request)) as TResponse;
        }
    };

    return run;
};
