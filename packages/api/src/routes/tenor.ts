import { Hono } from 'hono';
import { createHash } from 'node:crypto';
import { requireUser } from '../middleware/require-user';
import { createRateLimit } from '../middleware/rate-limit';
import {
    readTenorConfig,
    tenorFeatured,
    tenorRegisterShare,
    tenorSearch,
    toPickerItems,
    TenorUpstreamError,
    type TenorClientConfig,
    type TenorContentFilter,
} from '../integrations/tenor/client';
import { log } from '../telemetry/logger';

/**
 * Tenor GIF picker proxy.
 *
 *   GET /search?q=cats&pos=&limit=20    — search trending GIFs
 *   GET /featured?pos=&limit=20         — Tenor's featured/trending feed
 *   POST /share                         — record a share event (Tenor TOS)
 *
 * Why a proxy:
 *   - Keeps `TENOR_API_KEY` server-side; clients never see it.
 *   - Lets us send a stable per-user `client_key` (hashed user id) to
 *     improve Tenor's relevance without leaking the user id.
 *   - Lets us shrink the payload to only the formats the picker needs.
 *
 * Auth: inherits `/v1/*` authMiddleware. Each handler additionally calls
 * requireUser to keep anonymous traffic off the upstream key.
 *
 * Rate limit: separate bucket from /v1 global, scaled per IP. Picker
 * search-as-you-type can fire 5–10 req/min per user; budget for 30/min/IP.
 */

const tenorRoutes = new Hono();

const tenorRateLimit = createRateLimit({
    bucket: 'tenor',
    windowMs: 60_000,
    maxRequests: Number.parseInt(process.env.TENOR_RATE_LIMIT_MAX ?? '30', 10) || 30,
});

tenorRoutes.use('*', tenorRateLimit);

const hashUserId = (sub: string): string =>
    // Per Tenor docs, `client_key` should be a stable per-user identifier.
    // We hash so a Tenor data leak doesn't tie searches to a Blackout user id.
    createHash('sha256').update(sub).digest('hex').slice(0, 32);

const readContentFilter = (): TenorContentFilter => {
    const v = (process.env.TENOR_CONTENT_FILTER ?? 'medium').toLowerCase();
    if (v === 'off' || v === 'low' || v === 'medium' || v === 'high') return v;
    return 'medium';
};

const buildClientConfig = (apiKey: string, sub: string): TenorClientConfig => ({
    apiKey,
    clientKey: hashUserId(sub),
    contentFilter: readContentFilter(),
    defaultLimit: 24,
    locale: process.env.TENOR_LOCALE || undefined,
});

const handleTenorError = (err: unknown): Response => {
    if (err instanceof TenorUpstreamError) {
        log.warn('tenor: upstream error', { status: err.status, bodyExcerpt: err.bodyExcerpt });
        return new Response(
            JSON.stringify({ code: 'upstream_error', message: 'Tenor upstream error' }),
            { status: 502, headers: { 'content-type': 'application/json' } }
        );
    }
    log.error('tenor: unexpected error', { error: String(err) });
    return new Response(JSON.stringify({ code: 'tenor_failed', message: 'Tenor request failed' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
    });
};

const parseLimit = (raw: string | undefined): number | undefined => {
    if (!raw) return undefined;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
};

tenorRoutes.get('/search', async (c) => {
    const userOrResp = requireUser(c, 'Sign in required to search GIFs');
    if (userOrResp instanceof Response) return userOrResp;
    const cfg = readTenorConfig();
    if ('error' in cfg) {
        return c.json(
            { code: 'tenor_disabled', message: 'GIF search is not configured on this server.' },
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
        const response = await tenorSearch(buildClientConfig(cfg.apiKey, userOrResp.sub), {
            q,
            pos,
            limit,
        });
        return c.json({ items: toPickerItems(response), next: response.next || null });
    } catch (err) {
        return handleTenorError(err);
    }
});

tenorRoutes.get('/featured', async (c) => {
    const userOrResp = requireUser(c, 'Sign in required to browse GIFs');
    if (userOrResp instanceof Response) return userOrResp;
    const cfg = readTenorConfig();
    if ('error' in cfg) {
        return c.json(
            { code: 'tenor_disabled', message: 'GIF search is not configured on this server.' },
            503
        );
    }
    const pos = c.req.query('pos') || undefined;
    const limit = parseLimit(c.req.query('limit'));
    try {
        const response = await tenorFeatured(buildClientConfig(cfg.apiKey, userOrResp.sub), {
            pos,
            limit,
        });
        return c.json({ items: toPickerItems(response), next: response.next || null });
    } catch (err) {
        return handleTenorError(err);
    }
});

const MAX_BINARY_BYTES = 25 * 1024 * 1024;
const TENOR_CDN_HOST_SUFFIX = '.tenor.com';

const isTenorCdnUrl = (raw: string): boolean => {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return false;
    }
    if (url.protocol !== 'https:') return false;
    if (url.hostname === 'tenor.com') return true;
    return url.hostname.endsWith(TENOR_CDN_HOST_SUFFIX);
};

/**
 * Proxies a Tenor CDN GIF binary so the browser never talks to Tenor
 * directly. This keeps `media.tenor.com` out of the operator's CSP
 * `connect-src` allowlist and prevents Tenor from observing the user's
 * IP / cookies / referer.
 *
 * The URL is validated against the *.tenor.com suffix to block SSRF;
 * upstream responses are capped at `MAX_BINARY_BYTES` to avoid memory
 * exhaustion if Tenor ever returns something pathological.
 */
tenorRoutes.get('/binary', async (c) => {
    const userOrResp = requireUser(c, 'Sign in required');
    if (userOrResp instanceof Response) return userOrResp;
    const cfg = readTenorConfig();
    if ('error' in cfg) {
        return c.json(
            { code: 'tenor_disabled', message: 'GIF search is not configured on this server.' },
            503
        );
    }
    const target = c.req.query('url') ?? '';
    if (!isTenorCdnUrl(target)) {
        return c.json({ code: 'bad_request', message: 'URL must be on the Tenor CDN.' }, 400);
    }
    let upstream: Response;
    try {
        // redirect: 'manual' — do NOT follow redirects. The allowlist check above
        // only validates the initial URL; an open redirect on the CDN could
        // otherwise bounce us to an arbitrary host (SSRF). A 3xx now surfaces as
        // a non-ok response and fails closed below.
        upstream = await fetch(target, { method: 'GET', redirect: 'manual' });
    } catch (err) {
        log.warn('tenor: binary upstream fetch failed', { error: String(err) });
        return c.json({ code: 'upstream_error', message: 'Could not fetch GIF.' }, 502);
    }
    if (!upstream.ok || !upstream.body) {
        return c.json({ code: 'upstream_error', message: 'Could not fetch GIF.' }, 502);
    }
    const declaredLength = Number.parseInt(upstream.headers.get('content-length') ?? '', 10);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BINARY_BYTES) {
        return c.json({ code: 'too_large', message: 'GIF too large.' }, 413);
    }

    // Buffer-with-cap: GIFs we serve are small (<10MB typical), and Hono's
    // c.body accepts a Uint8Array directly. Streaming with a size cap is
    // possible but adds complexity for marginal benefit at this size class.
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

tenorRoutes.post('/share', async (c) => {
    const userOrResp = requireUser(c, 'Sign in required');
    if (userOrResp instanceof Response) return userOrResp;
    const cfg = readTenorConfig();
    if ('error' in cfg) {
        // Silent no-op when unconfigured; share is best-effort.
        return c.json({ ok: true });
    }
    let body: { id?: unknown; q?: unknown } = {};
    try {
        body = await c.req.json();
    } catch {
        body = {};
    }
    const id = typeof body.id === 'string' ? body.id : '';
    const q = typeof body.q === 'string' ? body.q : undefined;
    if (!id) return c.json({ code: 'bad_request', message: 'Body field `id` is required.' }, 400);
    await tenorRegisterShare(buildClientConfig(cfg.apiKey, userOrResp.sub), id, q);
    return c.json({ ok: true });
});

export default tenorRoutes;
