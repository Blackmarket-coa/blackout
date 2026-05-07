import { createClientQueries, createFetchApiClient, createMediaClient } from '@blackout/sdk';

/**
 * Base URL the API client makes requests against. Exported so callers
 * that need to build a URL the *browser* (or an external client like an
 * OBS browser source) will hit directly — e.g. the SSE alert stream URL
 * pasted into OBS — can construct an absolute URL without re-reading the
 * import.meta.env shape themselves.
 */
export const API_BASE_URL =
    (typeof import.meta !== 'undefined' &&
        (import.meta as { env?: { VITE_BLACKOUT_API_BASE_URL?: string } }).env
            ?.VITE_BLACKOUT_API_BASE_URL) ||
    '';

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

export const createAuthorizedApiClient = (token: string | null) =>
    createFetchApiClient({
        baseUrl: API_BASE_URL,
        defaultHeaders: token ? { authorization: `Bearer ${token}` } : undefined,
        defaultRetry: {
            attempts: 3,
            backoffMs: 100,
        },
    });
