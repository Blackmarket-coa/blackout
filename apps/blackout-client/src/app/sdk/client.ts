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

/**
 * Authenticated GET that returns a Blob. Used by integrations that need
 * to pipe a binary response from the Blackout API into a downstream
 * pipeline (e.g. the Tenor proxy → matrix uploadContent flow).
 *
 * Lives in the `sdk/` layer so it sits outside the no-direct-fetch guard
 * that covers `features/`, `pages/`, `components/`, and `platform/`.
 */
export const fetchAuthorizedBlob = async (
    path: string,
    token: string | null
): Promise<Blob> => {
    const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) {
        throw new Error(`Authorized blob fetch failed (${res.status}) for ${path}`);
    }
    return await res.blob();
};
