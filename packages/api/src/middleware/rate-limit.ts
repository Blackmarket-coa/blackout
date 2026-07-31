import type { Context, Next } from 'hono';
import { readRedisRuntimeConfig } from '../config/redis';
import { getAuthUser } from './require-user';
import { log } from '../telemetry/logger';
import { rateLimitHitsTotal } from '../telemetry/metrics';

export interface RateLimitOptions {
    bucket: string;
    windowMs: number;
    maxRequests: number;
    /** Override store for tests. If omitted, the default shared store is used. */
    store?: RateLimitStore;
    /**
     * Optional per-request identity (e.g. the authenticated user id) to key the
     * limit on instead of the client IP. Falls back to the IP key when it returns
     * a falsy value, so anonymous traffic is still bucketed by address.
     */
    identify?: (c: Context) => string | null | undefined;
    /**
     * When true, a store error rejects the request (429) instead of allowing it.
     * Use for security-sensitive buckets (auth/brute-force) where a Redis outage
     * must NOT silently disable protection. Defaults to false so a store blip
     * degrades to availability on non-sensitive buckets.
     */
    failClosed?: boolean;
}

/**
 * Increment the request counter for `key` and return the count of requests
 * inside the current sliding window. Implementations must be safe for
 * concurrent use across processes.
 */
export interface RateLimitStore {
    hit(key: string, windowMs: number): Promise<number>;
    /** Optional disposer for tests / graceful shutdown. */
    close?(): Promise<void>;
}

class InMemoryStore implements RateLimitStore {
    private readonly buckets = new Map<string, number[]>();

    async hit(key: string, windowMs: number): Promise<number> {
        const now = Date.now();
        const history = (this.buckets.get(key) ?? []).filter((ts) => now - ts < windowMs);
        history.push(now);
        this.buckets.set(key, history);
        return history.length;
    }
}

interface RedisLike {
    // Minimal subset of ioredis we depend on, so tests can stub freely.
    zremrangebyscore(key: string, min: number, max: number): Promise<number>;
    zadd(key: string, score: number, member: string): Promise<number>;
    zcard(key: string): Promise<number>;
    pexpire(key: string, ms: number): Promise<number>;
    quit?(): Promise<unknown>;
}

class RedisStore implements RateLimitStore {
    constructor(private readonly client: RedisLike, private readonly prefix: string) {}

    async hit(key: string, windowMs: number): Promise<number> {
        const fullKey = `${this.prefix}${key}`;
        const now = Date.now();
        const member = `${now}-${Math.random().toString(36).slice(2, 10)}`;
        await this.client.zremrangebyscore(fullKey, 0, now - windowMs);
        await this.client.zadd(fullKey, now, member);
        const count = await this.client.zcard(fullKey);
        await this.client.pexpire(fullKey, windowMs);
        return count;
    }

    async close(): Promise<void> {
        await this.client.quit?.();
    }
}

let defaultStore: RateLimitStore | null = null;
let defaultStoreInit: Promise<RateLimitStore> | null = null;

const initDefaultStore = async (): Promise<RateLimitStore> => {
    const cfg = readRedisRuntimeConfig();
    if (!cfg.url) {
        log.warn(
            'rate-limit: no REDIS_URL configured — using in-memory store (single-process only)'
        );
        return new InMemoryStore();
    }
    // Lazy import so tests and dev environments without ioredis installed still work.
    const { default: IORedis } = (await import('ioredis')) as {
        default: new (url: string) => RedisLike;
    };
    const client = new IORedis(cfg.url);
    return new RedisStore(client, cfg.rateLimitPrefix);
};

export const getDefaultRateLimitStore = async (): Promise<RateLimitStore> => {
    if (defaultStore) return defaultStore;
    if (!defaultStoreInit) {
        defaultStoreInit = initDefaultStore().then((s) => {
            defaultStore = s;
            return s;
        });
    }
    return defaultStoreInit;
};

export const setDefaultRateLimitStore = (store: RateLimitStore | null): void => {
    defaultStore = store;
    defaultStoreInit = store ? Promise.resolve(store) : null;
};

// Number of trusted reverse-proxy hops in front of the API (e.g. Caddy /
// Cloudflared terminating TLS). Each trusted hop appends its caller to the
// RIGHT of `X-Forwarded-For`, so the client's real address is the Nth entry
// from the right, where N = TRUSTED_PROXY_HOPS. Defaults to 1.
const parsedHops = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? '', 10);
const TRUSTED_PROXY_HOPS = Number.isFinite(parsedHops) && parsedHops > 0 ? parsedHops : 1;

const clientKey = (c: Context, bucket: string): string => {
    // Take the address our trusted proxy appended, counting from the RIGHT. Taking
    // the *left*-most (first) value trusts a client-injected header, which lets an
    // attacker rotate `X-Forwarded-For` to evade the limit (e.g. on login /
    // password-reset). Fall back to x-real-ip, then a constant.
    const fwd = c.req.header('x-forwarded-for');
    const chain = fwd
        ? fwd
              .split(',')
              .map((part) => part.trim())
              .filter(Boolean)
        : [];
    let ip: string;
    if (chain.length > 0) {
        const idx = Math.max(0, chain.length - TRUSTED_PROXY_HOPS);
        ip = chain[idx] ?? chain[0]!;
    } else {
        ip = (c.req.header('x-real-ip') ?? 'local').trim() || 'local';
    }
    return `${bucket}:${ip}`;
};

export function createRateLimit(options: RateLimitOptions) {
    const { bucket, windowMs, maxRequests, store: providedStore, identify, failClosed } = options;
    let resolvedStore: RateLimitStore | null = providedStore ?? null;

    return async function rateLimitMiddleware(c: Context, next: Next) {
        if (!resolvedStore) {
            resolvedStore = providedStore ?? (await getDefaultRateLimitStore());
        }
        const store = resolvedStore;
        const identity = identify?.(c);
        const key = identity ? `${bucket}:${identity}` : clientKey(c, bucket);

        let count: number;
        try {
            count = await store.hit(key, windowMs);
        } catch (err) {
            if (failClosed) {
                // Security-sensitive bucket: a store outage must not silently
                // disable brute-force protection. Reject rather than allow.
                log.error('rate-limit: store error, rejecting request (fail-closed)', {
                    bucket,
                    error: String(err),
                });
                const retryAfter = Math.ceil(windowMs / 1000);
                c.header('Retry-After', String(retryAfter));
                return c.json({ code: 'rate_limited', message: 'Rate limit unavailable' }, 429);
            }
            // Non-sensitive bucket: fail-open with a warning rather than 500, so a
            // store blip degrades to availability.
            log.warn('rate-limit: store error, allowing request', { bucket, error: String(err) });
            return next();
        }

        if (count > maxRequests) {
            rateLimitHitsTotal.inc({ bucket });
            const retryAfter = Math.ceil(windowMs / 1000);
            c.header('Retry-After', String(retryAfter));
            return c.json({ code: 'rate_limited', message: 'Rate limit exceeded' }, 429);
        }

        await next();
    };
}

export const rateLimit = createRateLimit({ bucket: 'global', windowMs: 60_000, maxRequests: 120 });

const authMax = Number.parseInt(process.env.AUTH_RATE_LIMIT_MAX ?? '', 10);
export const authRateLimit = createRateLimit({
    bucket: 'auth',
    windowMs: 60_000,
    maxRequests: Number.isFinite(authMax) && authMax > 0 ? authMax : 10,
    // Brute-force protection must not vanish during a Redis outage.
    failClosed: true,
});

// Mutating clip endpoints (create/update/delete). Reads stay on the global
// limiter; writes get a tighter per-IP bucket so a single client can't flood
// the clip store. Override with CLIP_WRITE_RATE_LIMIT_MAX.
const clipWriteMax = Number.parseInt(process.env.CLIP_WRITE_RATE_LIMIT_MAX ?? '', 10);
export const clipWriteRateLimit = createRateLimit({
    bucket: 'clip-write',
    windowMs: 60_000,
    maxRequests: Number.isFinite(clipWriteMax) && clipWriteMax > 0 ? clipWriteMax : 30,
});

// User-facing integration settings surfaces: chat bridges (Twitch/YouTube/
// Kick), discord-compat + outbound webhooks, simulcast destinations + RTMP
// fanout, OBS-WS passwords, twitch-compat bot tokens, Twitch extensions, and
// widget alert tokens. The streaming hub stacks these panels and each fires a
// list fetch on mount, so a single page view is ~10 requests. They must NOT
// share the tight `auth` bucket with login/exchange, or a normal page load
// competes with sign-in traffic and 429s — and, because `auth` is fail-closed,
// a Redis blip would take the whole settings page down with it. Own bucket,
// sized for a few page views per minute, keyed per authenticated user (IP for
// anonymous callers) so users behind one NAT don't share a budget. Override
// with INTEGRATIONS_RATE_LIMIT_MAX.
const integrationsMax = Number.parseInt(process.env.INTEGRATIONS_RATE_LIMIT_MAX ?? '', 10);
export const integrationsRateLimit = createRateLimit({
    bucket: 'integrations',
    windowMs: 60_000,
    maxRequests: Number.isFinite(integrationsMax) && integrationsMax > 0 ? integrationsMax : 60,
    identify: (c) => getAuthUser(c)?.sub ?? null,
});
