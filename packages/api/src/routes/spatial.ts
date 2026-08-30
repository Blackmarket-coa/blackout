import { createHash, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { log } from '../telemetry/logger';
import { createRateLimit } from '../middleware/rate-limit';
import { geocode, readGeocoderConfig } from '../services/geocoder';

/**
 * `/v1/spatial/*` — the service-to-service spatial surface (W5, decision D5:
 * Blackout is the ecosystem's single spatial home; FBM retires its ZIP3
 * table by consuming this instead).
 *
 * Deliberately NOT a user surface: callers are other backends (today: FBM's
 * `blackout-spatial` consumer), authenticated by a static service token in
 * the dedicated `x-spatial-token` header — the shared-secret discipline of
 * `matrixAppservice`, carried in a custom header (the `x-fbm-signature`
 * precedent) because the global `/v1` middleware treats any Authorization
 * bearer as a user JWT and 401s unknown ones before route middleware runs.
 * `SPATIAL_SERVICE_TOKENS` holds one or more comma-separated tokens
 * (rotation = add the new one, drop the old); unset ⇒ every route answers
 * 503 and the surface is dark, which is the default.
 *
 * Rate limiting is per-token (`SPATIAL_RATE_LIMIT_MAX`/min, default 120) —
 * NOT the per-user coalition geocode bucket, and NOT per-IP: a whole peer
 * backend arrives from one address and must not share one user-sized bucket.
 *
 * The user-facing `/v1/coalition/geocode` is untouched; both delegate to the
 * same `services/geocoder` proxy, so its hardening (no default upstream,
 * timeouts, response caps, never logging the query) applies here verbatim.
 */

/** Hash-then-compare so neither length nor prefix leaks through timing. */
function timingSafeSecretEqual(presented: string, expected: string): boolean {
    const a = createHash('sha256').update(presented, 'utf8').digest();
    const b = createHash('sha256').update(expected, 'utf8').digest();
    return timingSafeEqual(a, b);
}

/** Read per-request so operators can enable/rotate without a restart. */
function readServiceTokens(): string[] {
    return (process.env.SPATIAL_SERVICE_TOKENS ?? '')
        .split(',')
        .map((token) => token.trim())
        .filter((token) => token.length > 0);
}

function parsedRateLimitMax(): number {
    const parsed = Number.parseInt(process.env.SPATIAL_RATE_LIMIT_MAX ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 120;
}

/**
 * A stable, non-reversible caller id for rate bucketing and logs. The token
 * itself never appears anywhere — only the first 12 hex of its SHA-256.
 */
function callerId(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex').slice(0, 12);
}

const requireServiceToken = async (c: Context, next: Next) => {
    const tokens = readServiceTokens();
    if (tokens.length === 0) {
        return c.json(
            {
                code: 'spatial_disabled',
                message: 'The spatial service surface is not enabled on this server.',
            },
            503
        );
    }
    const presented = c.req.header('x-spatial-token')?.trim() ?? '';
    const matched = tokens.find((token) => timingSafeSecretEqual(presented, token));
    if (!presented || !matched) {
        log.info('spatial_bad_token');
        return c.json({ code: 'forbidden', message: 'Invalid service token.' }, 403);
    }
    c.set('spatialCaller', callerId(matched));
    return next();
};

const spatialRateLimit = createRateLimit({
    bucket: 'spatial-service',
    windowMs: 60_000,
    maxRequests: parsedRateLimitMax(),
    identify: (c) => (c.get('spatialCaller') as string | undefined) ?? null,
});

const spatial = new Hono();

spatial.use('*', requireServiceToken);

/**
 * GET /v1/spatial/health — configuration probe for consumers' ops checks.
 * Behind the token like everything else: geocoder configuration state is
 * operator information, not public.
 */
spatial.get('/health', (c) => {
    const config = readGeocoderConfig();
    return c.json({
        configured: !('error' in config),
        generatedAt: new Date().toISOString(),
    });
});

/**
 * GET /v1/spatial/geocode?q=<text> — forward geocoding for service
 * consumers. Same wire contract as the user route: 400 on bad input,
 * 503 `geocoder_disabled` when no upstream is configured, 502
 * `upstream_error` on upstream failure, else `{ results: [{ label,
 * latitude, longitude }] }`. A postal code is just a query string here —
 * FBM's ZIP path sends `q=<postal code>`.
 */
spatial.get('/geocode', spatialRateLimit, async (c) => {
    const query = (c.req.query('q') ?? '').trim();
    if (query.length < 3) {
        return c.json(
            { code: 'bad_request', message: 'Enter at least 3 characters to search.' },
            400
        );
    }
    if (query.length > 300) {
        return c.json({ code: 'bad_request', message: 'Search text is too long.' }, 400);
    }

    const outcome = await geocode(query);
    if (!outcome.ok) {
        return outcome.code === 'disabled'
            ? c.json(
                  {
                      code: 'geocoder_disabled',
                      message: 'Address search is not set up on this server.',
                  },
                  503
              )
            : c.json({ code: 'upstream_error', message: outcome.message }, 502);
    }
    return c.json({ results: outcome.results });
});

export default spatial;
