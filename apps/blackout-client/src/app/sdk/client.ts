import { createClientQueries, createFetchApiClient, createMediaClient } from '@blackout/sdk';

/**
 * Base URL the API client makes requests against. Exported so callers
 * that need to build a URL the *browser* (or an external client like an
 * OBS browser source) will hit directly — e.g. the SSE alert stream URL
 * pasted into OBS — can construct an absolute URL without re-reading the
 * import.meta.env shape themselves.
 */
const viteEnv =
    typeof import.meta !== 'undefined'
        ? (
              import.meta as {
                  env?: { VITE_API_BASE_URL?: string; PROD?: boolean };
              }
          ).env
        : undefined;

if (viteEnv?.PROD && !viteEnv.VITE_API_BASE_URL) {
    // eslint-disable-next-line no-console
    console.error(
        '[blackout] VITE_API_BASE_URL is not set. The client will issue same-origin requests and likely receive SPA HTML instead of JSON. See apps/blackout-client/.env.example.',
    );
}

export const API_BASE_URL = viteEnv?.VITE_API_BASE_URL ?? '';

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
