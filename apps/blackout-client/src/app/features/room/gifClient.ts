import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';
import { BlackoutSdkError } from '@blackout/sdk';
import { registerTenorShare } from './tenorClient';

/**
 * Provider-agnostic browser client for the GIF picker proxies mounted at
 * `/v1/integrations/{giphy,tenor}` on the Blackout API. Both proxies emit
 * the identical `{ items, next }` wire shape, so the picker UI doesn't
 * care which provider serves it.
 *
 * Provider resolution: Giphy is the decided primary (deferred-bodies
 * schedule Q2, resolved 2026-07-11); Tenor remains for deployments that
 * only have a Tenor key configured. The first successful list call pins
 * the provider for the session so pagination cursors (which are
 * provider-specific) stay coherent. A provider that 503s
 * (`*_disabled` — its API key is unset server-side) falls through to the
 * next; only when every provider is disabled do callers see
 * `GifDisabledError` and fall back to the "No GIF Packs!" empty state.
 */

export type GifProvider = 'giphy' | 'tenor';

const PROVIDER_ORDER: GifProvider[] = ['giphy', 'tenor'];

/** Display names for attribution lines ("Powered by GIPHY" is a Giphy TOS requirement). */
export const GIF_PROVIDER_LABELS: Record<GifProvider, string> = {
    giphy: 'GIPHY',
    tenor: 'Tenor',
};

export interface GifPickerItem {
    id: string;
    description: string;
    gif: { url: string; width: number; height: number; size?: number };
    preview: { url: string; width: number; height: number };
    provider: GifProvider;
}

export interface GifListResult {
    items: GifPickerItem[];
    next: string | null;
    provider: GifProvider;
}

export class GifDisabledError extends Error {
    constructor() {
        super('GIF search is not configured on this server.');
        this.name = 'GifDisabledError';
    }
}

const isHttp503 = (err: unknown): boolean => err instanceof BlackoutSdkError && err.status === 503;

const buildQuery = (params: Record<string, string | number | undefined>): string => {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === '') continue;
        usp.set(k, String(v));
    }
    const qs = usp.toString();
    return qs ? `?${qs}` : '';
};

interface RawListResult {
    items: Array<Omit<GifPickerItem, 'provider'>>;
    next: string | null;
}

// Pinned once a provider answers successfully, so follow-up pages reuse
// the same provider (cursors don't translate across providers).
let pinnedProvider: GifProvider | null = null;

export const __resetGifProviderForTests = (): void => {
    pinnedProvider = null;
};

const listFrom = async (
    provider: GifProvider,
    endpoint: 'search' | 'featured',
    params: Record<string, string | number | undefined>,
    token: string | null
): Promise<GifListResult> => {
    const path = `/v1/integrations/${provider}/${endpoint}${buildQuery(params)}`;
    const raw = (await createAuthorizedApiClient(token)({
        method: 'GET',
        path,
    })) as RawListResult;
    return {
        items: raw.items.map((item) => ({ ...item, provider })),
        next: raw.next,
        provider,
    };
};

const listGifs = async (
    endpoint: 'search' | 'featured',
    params: Record<string, string | number | undefined>,
    token: string | null
): Promise<GifListResult> => {
    const order = pinnedProvider
        ? [pinnedProvider, ...PROVIDER_ORDER.filter((p) => p !== pinnedProvider)]
        : PROVIDER_ORDER;
    for (const provider of order) {
        try {
            const result = await listFrom(provider, endpoint, params, token);
            pinnedProvider = provider;
            return result;
        } catch (err) {
            if (isHttp503(err)) {
                // This provider is unconfigured server-side; if it was the
                // pinned one (server config changed), unpin and try the next.
                if (pinnedProvider === provider) pinnedProvider = null;
                continue;
            }
            throw err;
        }
    }
    throw new GifDisabledError();
};

export const searchGifs = (
    q: string,
    options: { pos?: string; limit?: number } = {},
    token: string | null = readBlackoutApiToken()
): Promise<GifListResult> =>
    listGifs('search', { q, pos: options.pos, limit: options.limit }, token);

export const fetchFeaturedGifs = (
    options: { pos?: string; limit?: number } = {},
    token: string | null = readBlackoutApiToken()
): Promise<GifListResult> =>
    listGifs('featured', { pos: options.pos, limit: options.limit }, token);

/**
 * Best-effort share registration. Tenor's TOS requires a registershare
 * ping when a GIF is actually sent; Giphy has no equivalent, so it
 * resolves as a no-op.
 */
export const registerGifShare = (
    item: Pick<GifPickerItem, 'id' | 'provider'>,
    q?: string
): Promise<{ ok: true }> =>
    item.provider === 'tenor' ? registerTenorShare(item.id, q) : Promise.resolve({ ok: true });

/**
 * Absolute URL for the provider's binary proxy. The room composer loads
 * the chosen GIF into a Blob through the Blackout API origin, so the
 * provider CDN never sees the user's IP.
 */
export const buildGifBinaryUrl = (
    provider: GifProvider,
    cdnUrl: string,
    apiBaseUrl: string
): string =>
    `${apiBaseUrl || ''}/v1/integrations/${provider}/binary?url=${encodeURIComponent(cdnUrl)}`;
