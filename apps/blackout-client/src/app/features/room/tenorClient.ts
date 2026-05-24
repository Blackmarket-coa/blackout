import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';
import { BlackoutSdkError } from '@blackout/sdk';

/**
 * Browser-side client for the Tenor GIF picker proxy mounted at
 * `/v1/integrations/tenor` on the Blackout API. The proxy holds the
 * Tenor API key and pseudonymizes the per-user client_key, so the
 * browser never sees either.
 *
 * Disabled state: if `TENOR_API_KEY` is unset on the server, all calls
 * return HTTP 503. Callers should treat the resulting rejection as a
 * `TenorDisabledError` and fall back to the existing "No GIF Packs!"
 * empty state.
 */

const TENOR_BASE = '/v1/integrations/tenor';

export interface TenorPickerItem {
    id: string;
    description: string;
    gif: { url: string; width: number; height: number; size?: number };
    preview: { url: string; width: number; height: number };
}

export interface TenorListResult {
    items: TenorPickerItem[];
    next: string | null;
}

export class TenorDisabledError extends Error {
    constructor() {
        super('Tenor GIF search is not configured on this server.');
        this.name = 'TenorDisabledError';
    }
}

const isHttp503 = (err: unknown): boolean =>
    err instanceof BlackoutSdkError && err.status === 503;

const callJson = async <T>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    token: string | null
): Promise<T> => {
    try {
        return (await createAuthorizedApiClient(token)({ method, path, body })) as T;
    } catch (err) {
        if (isHttp503(err)) throw new TenorDisabledError();
        throw err;
    }
};

const buildQuery = (params: Record<string, string | number | undefined>): string => {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === '') continue;
        usp.set(k, String(v));
    }
    const qs = usp.toString();
    return qs ? `?${qs}` : '';
};

export const searchTenor = (
    q: string,
    options: { pos?: string; limit?: number } = {},
    token: string | null = readBlackoutApiToken()
): Promise<TenorListResult> =>
    callJson('GET', `${TENOR_BASE}/search${buildQuery({ q, pos: options.pos, limit: options.limit })}`, undefined, token);

export const fetchTenorFeatured = (
    options: { pos?: string; limit?: number } = {},
    token: string | null = readBlackoutApiToken()
): Promise<TenorListResult> =>
    callJson('GET', `${TENOR_BASE}/featured${buildQuery({ pos: options.pos, limit: options.limit })}`, undefined, token);

export const registerTenorShare = (
    id: string,
    q: string | undefined = undefined,
    token: string | null = readBlackoutApiToken()
): Promise<{ ok: true }> => callJson('POST', `${TENOR_BASE}/share`, { id, q }, token);

/**
 * Build the absolute URL for the Tenor binary proxy. Used by the
 * room composer to load the chosen GIF into a Blob before uploading
 * to the Matrix homeserver. The browser only ever talks to the
 * Blackout API origin — Tenor's CDN never sees the user's IP.
 */
export const buildTenorBinaryUrl = (tenorCdnUrl: string, apiBaseUrl: string): string => {
    const base = apiBaseUrl || '';
    return `${base}${TENOR_BASE}/binary?url=${encodeURIComponent(tenorCdnUrl)}`;
};
