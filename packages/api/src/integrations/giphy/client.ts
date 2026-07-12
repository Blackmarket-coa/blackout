/**
 * Giphy API client. Used by `routes/giphy.ts` to proxy GIF search and
 * trending requests so the API key stays server-side. Giphy is the decided
 * GIF provider (deferred-bodies schedule, open question Q2 — resolved
 * 2026-07-11); the Tenor proxy remains for deployments already configured
 * with a Tenor key, and the client prefers Giphy when both are set.
 *
 * Giphy API reference: https://developers.giphy.com/docs/api/endpoint
 *
 * Required env: `GIPHY_API_KEY`. Without it the proxy returns 503 and the
 * client falls back to Tenor (or the "No GIF Packs!" empty state).
 *
 * Wire shape parity: `toPickerItems` emits the exact same picker-item shape
 * as the Tenor client so the browser GIF tab is provider-agnostic.
 */

const GIPHY_BASE = 'https://api.giphy.com/v1/gifs';

export type GiphyRating = 'g' | 'pg' | 'pg-13' | 'r';

interface GiphyImageVariant {
    url?: string;
    /** Giphy serializes dimensions as strings. */
    width?: string;
    height?: string;
    size?: string;
}

export interface GiphyGif {
    id: string;
    title?: string;
    alt_text?: string;
    images: Partial<Record<'original' | 'fixed_width' | 'fixed_width_small', GiphyImageVariant>>;
}

export interface GiphyListResponse {
    data: GiphyGif[];
    pagination: { total_count: number; count: number; offset: number };
}

export interface GiphyClientConfig {
    apiKey: string;
    /** Default: 'pg-13'. */
    rating?: GiphyRating;
    /** Default: 20. Giphy allows 1..50. */
    defaultLimit?: number;
    /** ISO-639-1 language for search relevance, e.g. "en". */
    lang?: string;
    fetchFn?: typeof fetch;
}

export interface GiphySearchParams {
    q: string;
    /** Stringified numeric offset — mirrors Tenor's `pos` cursor contract. */
    pos?: string;
    limit?: number;
}

export interface GiphyTrendingParams {
    pos?: string;
    limit?: number;
}

export const readGiphyConfig = (
    env: NodeJS.ProcessEnv = process.env
): { apiKey: string } | { error: 'missing_api_key' } => {
    const apiKey = env.GIPHY_API_KEY?.trim();
    if (!apiKey) return { error: 'missing_api_key' };
    return { apiKey };
};

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

const parseOffset = (pos: string | undefined): number => {
    if (!pos) return 0;
    const n = Number.parseInt(pos, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
};

const buildUrl = (
    path: string,
    config: GiphyClientConfig,
    params: Record<string, string | number | undefined>
): string => {
    const url = new URL(`${GIPHY_BASE}${path}`);
    url.searchParams.set('api_key', config.apiKey);
    url.searchParams.set('rating', config.rating ?? 'pg-13');
    // The messaging bundle keeps payloads to renditions suitable for chat.
    url.searchParams.set('bundle', 'messaging_non_clips');
    if (config.lang) url.searchParams.set('lang', config.lang);
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === '') continue;
        url.searchParams.set(k, String(v));
    }
    return url.toString();
};

export class GiphyUpstreamError extends Error {
    constructor(public readonly status: number, public readonly bodyExcerpt: string) {
        super(`Giphy upstream returned ${status}`);
        this.name = 'GiphyUpstreamError';
    }
}

const fetchJson = async <T>(url: string, fetchFn: typeof fetch): Promise<T> => {
    const res = await fetchFn(url, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new GiphyUpstreamError(res.status, body.slice(0, 256));
    }
    return (await res.json()) as T;
};

export const giphySearch = async (
    config: GiphyClientConfig,
    params: GiphySearchParams
): Promise<GiphyListResponse> => {
    const limit = clamp(params.limit ?? config.defaultLimit ?? 20, 1, 50);
    const url = buildUrl('/search', config, {
        q: params.q,
        offset: parseOffset(params.pos),
        limit,
    });
    return fetchJson<GiphyListResponse>(url, config.fetchFn ?? fetch);
};

export const giphyTrending = async (
    config: GiphyClientConfig,
    params: GiphyTrendingParams
): Promise<GiphyListResponse> => {
    const limit = clamp(params.limit ?? config.defaultLimit ?? 20, 1, 50);
    const url = buildUrl('/trending', config, { offset: parseOffset(params.pos), limit });
    return fetchJson<GiphyListResponse>(url, config.fetchFn ?? fetch);
};

/** Same picker-item shape as `integrations/tenor/client.ts`. */
export interface GiphyPickerItem {
    id: string;
    description: string;
    gif: { url: string; width: number; height: number; size?: number };
    preview: { url: string; width: number; height: number };
}

const toDims = (variant: GiphyImageVariant | undefined) => {
    if (!variant?.url) return null;
    const width = Number.parseInt(variant.width ?? '', 10);
    const height = Number.parseInt(variant.height ?? '', 10);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    const size = Number.parseInt(variant.size ?? '', 10);
    return {
        url: variant.url,
        width,
        height,
        size: Number.isFinite(size) ? size : undefined,
    };
};

export const toPickerItems = (response: GiphyListResponse): GiphyPickerItem[] => {
    const items: GiphyPickerItem[] = [];
    for (const gif of response.data) {
        const full = toDims(gif.images.original);
        const preview =
            toDims(gif.images.fixed_width_small) ?? toDims(gif.images.fixed_width) ?? full;
        if (!full || !preview) continue;
        items.push({
            id: gif.id,
            description: gif.alt_text || gif.title || 'GIF',
            gif: { url: full.url, width: full.width, height: full.height, size: full.size },
            preview: { url: preview.url, width: preview.width, height: preview.height },
        });
    }
    return items;
};

/**
 * Tenor's `next` is an opaque cursor; Giphy paginates by offset. Emit the
 * next offset as a string cursor (or null at the end) so both providers
 * present the identical `{ items, next }` wire contract.
 */
export const nextCursor = (response: GiphyListResponse): string | null => {
    const { offset, count, total_count: total } = response.pagination;
    const next = offset + count;
    return count > 0 && next < total ? String(next) : null;
};
