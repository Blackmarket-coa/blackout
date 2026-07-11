import { Hono } from 'hono';
import { requireUser } from '../middleware/require-user';
import { createRateLimit } from '../middleware/rate-limit';
import {
    readGiphyConfig,
    giphySearch,
    giphyTrending,
    toPickerItems,
    nextCursor,
    GiphyUpstreamError,
    type GiphyClientConfig,
    type GiphyRating,
} from '../integrations/giphy/client';
import { log } from '../telemetry/logger';

/**
 * Giphy GIF picker proxy. Wire-compatible with `routes/tenor.ts` so the
 * client picker is provider-agnostic:
 *
 *   GET /search?q=cats&pos=&limit=20    — search GIFs
 *   GET /featured?pos=&limit=20         — Giphy's trending feed
 *   GET /binary?url=…                   — proxy a Giphy CDN binary
 *
 * (No /share — Giphy has no Tenor-style share-registration requirement.)
 *
 * Why a proxy:
 *   - Keeps `GIPHY_API_KEY` server-side; clients never see it.
 *   - Lets us shrink the payload to only the formats the picker needs.
 *   - /binary keeps Giphy CDNs out of the operator's CSP and prevents
 *     Giphy from observing the user's IP / cookies / referer.
 *
 * Auth: inherits `/v1/*` authMiddleware. Each handler additionally calls
 * requireUser to keep anonymous traffic off the upstream key.
 *
 * Rate limit: separate bucket from /v1 global, scaled per IP — same
 * budget rationale as the Tenor proxy (search-as-you-type).
 */

const giphyRoutes = new Hono();

const giphyRateLimit = createRateLimit({
    bucket: 'giphy',
    windowMs: 60_000,
    maxRequests: Number.parseInt(process.env.GIPHY_RATE_LIMIT_MAX ?? '30', 10) || 30,
});

giphyRoutes.use('*', giphyRateLimit);

const readRating = (): GiphyRating => {
    const v = (process.env.GIPHY_RATING ?? 'pg-13').toLowerCase();
    if (v === 'g' || v === 'pg' || v === 'pg-13' || v === 'r') return v;
    return 'pg-13';
};

const buildClientConfig = (apiKey: string): GiphyClientConfig => ({
    apiKey,
    rating: readRating(),
    defaultLimit: 24,
    lang: process.env.GIPHY_LANG || undefined,
});

const handleGiphyError = (err: unknown): Response => {
    if (err instanceof GiphyUpstreamError) {
        log.warn('giphy: upstream error', { status: err.status, body: err.bodyExcerpt });
        return new Response(
            JSON.stringify({ code: 'upstream_error', message: 'Giphy upstream error' }),
            { status: 502, headers: { 'content-type': 'application/json' } }
        );
    }
    log.error('giphy: unexpected error', { error: String(err) });
    return new Response(JSON.stringify({ code: 'giphy_failed', message: 'Giphy request failed' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
    });
};

const parseLimit = (raw: string | undefined): number | undefined => {
    if (!raw) return undefined;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
};

giphyRoutes.get('/search', async (c) => {
    const userOrResp = requireUser(c, 'Sign in required to search GIFs');
    if (userOrResp instanceof Response) return userOrResp;
    const cfg = readGiphyConfig();
    if ('error' in cfg) {
        return c.json(
            { code: 'giphy_disabled', message: 'GIF search is not configured on this server.' },
            503
        );
    }
    const q = c.req.query('q')?.trim();
    if (!q) {
        return c.json({ code: 'bad_request', message: 'Query parameter `q` is required.' }, 400);
    }
    const pos = c.req.query('pos') || undefined;
    const limit = parseLimit(c.req.query('limit'));
    try {
        const response = await giphySearch(buildClientConfig(cfg.apiKey), { q, pos, limit });
        return c.json({ items: toPickerItems(response), next: nextCursor(response) });
    } catch (err) {
        return handleGiphyError(err);
    }
});

giphyRoutes.get('/featured', async (c) => {
    const userOrResp = requireUser(c, 'Sign in required to browse GIFs');
    if (userOrResp instanceof Response) return userOrResp;
    const cfg = readGiphyConfig();
    if ('error' in cfg) {
        return c.json(
            { code: 'giphy_disabled', message: 'GIF search is not configured on this server.' },
            503
        );
    }
    const pos = c.req.query('pos') || undefined;
    const limit = parseLimit(c.req.query('limit'));
    try {
        const response = await giphyTrending(buildClientConfig(cfg.apiKey), { pos, limit });
        return c.json({ items: toPickerItems(response), next: nextCursor(response) });
    } catch (err) {
        return handleGiphyError(err);
    }
});

const MAX_BINARY_BYTES = 25 * 1024 * 1024;
const GIPHY_CDN_HOST_SUFFIX = '.giphy.com';

const isGiphyCdnUrl = (raw: string): boolean => {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return false;
    }
    if (url.protocol !== 'https:') return false;
    if (url.hostname === 'giphy.com') return true;
    return url.hostname.endsWith(GIPHY_CDN_HOST_SUFFIX);
};

/**
 * Proxies a Giphy CDN GIF binary — same SSRF suffix guard and buffered
 * size cap as the Tenor /binary proxy (see routes/tenor.ts for the
 * buffering rationale).
 */
giphyRoutes.get('/binary', async (c) => {
    const userOrResp = requireUser(c, 'Sign in required');
    if (userOrResp instanceof Response) return userOrResp;
    const cfg = readGiphyConfig();
    if ('error' in cfg) {
        return c.json(
            { code: 'giphy_disabled', message: 'GIF search is not configured on this server.' },
            503
        );
    }
    const target = c.req.query('url') ?? '';
    if (!isGiphyCdnUrl(target)) {
        return c.json({ code: 'bad_request', message: 'URL must be on the Giphy CDN.' }, 400);
    }
    let upstream: Response;
    try {
        upstream = await fetch(target, { method: 'GET' });
    } catch (err) {
        log.warn('giphy: binary upstream fetch failed', { error: String(err) });
        return c.json({ code: 'upstream_error', message: 'Could not fetch GIF.' }, 502);
    }
    if (!upstream.ok || !upstream.body) {
        return c.json({ code: 'upstream_error', message: 'Could not fetch GIF.' }, 502);
    }
    const declaredLength = Number.parseInt(upstream.headers.get('content-length') ?? '', 10);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BINARY_BYTES) {
        return c.json({ code: 'too_large', message: 'GIF too large.' }, 413);
    }

    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
        // eslint-disable-next-line no-await-in-loop
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
            total += value.byteLength;
            if (total > MAX_BINARY_BYTES) {
                try {
                    await reader.cancel();
                } catch {
                    // ignore
                }
                return c.json({ code: 'too_large', message: 'GIF too large.' }, 413);
            }
            chunks.push(value);
        }
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
    }
    c.header('Content-Type', upstream.headers.get('content-type') ?? 'image/gif');
    c.header('Cache-Control', 'private, max-age=300');
    return c.body(merged);
});

export default giphyRoutes;
