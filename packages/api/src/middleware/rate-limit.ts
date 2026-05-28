import type { Context, Next } from 'hono';
import { readRedisRuntimeConfig } from '../config/redis';
import { log } from '../telemetry/logger';
import { rateLimitFailOpenTotal, rateLimitHitsTotal } from '../telemetry/metrics';

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
    log.warn('rate-limit: no REDIS_URL configured — using in-memory store (single-process only)');
    return new InMemoryStore();
  }
  // Lazy import so tests and dev environments without ioredis installed still work.
  const { default: IORedis } = (await import('ioredis')) as { default: new (url: string) => RedisLike };
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

const clientKey = (c: Context, bucket: string): string => {
  // Trust the hop directly in front of us; production deployments terminate TLS at Caddy/Cloudflared
  // which set X-Forwarded-For. Take the *first* address if a chain is present.
  const fwd = c.req.header('x-forwarded-for');
  const ip = (fwd?.split(',')[0] ?? c.req.header('x-real-ip') ?? 'local').trim() || 'local';
  return `${bucket}:${ip}`;
};

export function createRateLimit(options: RateLimitOptions) {
  const { bucket, windowMs, maxRequests, store: providedStore, identify } = options;
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
      rateLimitFailOpenTotal.inc({ bucket });
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

const webhookMax = Number.parseInt(process.env.WEBHOOK_RATE_LIMIT_MAX ?? '', 10);
export const webhookRateLimit = createRateLimit({
  bucket: 'webhook',
  windowMs: 60_000,
  maxRequests: Number.isFinite(webhookMax) && webhookMax > 0 ? webhookMax : 60,
});

const perturbMax = Number.parseInt(process.env.PERTURBATION_RATE_LIMIT_MAX ?? '', 10);
export const perturbRateLimit = createRateLimit({
  bucket: 'perturb',
  windowMs: 60_000,
  maxRequests: Number.isFinite(perturbMax) && perturbMax > 0 ? perturbMax : 10,
});

const mfaMax = Number.parseInt(process.env.MFA_RATE_LIMIT_MAX ?? '', 10);
export const mfaRateLimit = createRateLimit({
  bucket: 'mfa',
  windowMs: 60_000,
  maxRequests: Number.isFinite(mfaMax) && mfaMax > 0 ? mfaMax : 5,
});

const messageMax = Number.parseInt(process.env.MESSAGE_RATE_LIMIT_MAX ?? '', 10);
export const messageRateLimit = createRateLimit({
  bucket: 'message',
  windowMs: 60_000,
  maxRequests: Number.isFinite(messageMax) && messageMax > 0 ? messageMax : 60,
});

const writeMax = Number.parseInt(process.env.WRITE_RATE_LIMIT_MAX ?? '', 10);
export const writeRateLimit = createRateLimit({
  bucket: 'write',
  windowMs: 60_000,
  maxRequests: Number.isFinite(writeMax) && writeMax > 0 ? writeMax : 30,
});

const coalitionMax = Number.parseInt(process.env.COALITION_RATE_LIMIT_MAX ?? '', 10);
export const coalitionRateLimit = createRateLimit({
  bucket: 'coalition',
  windowMs: 60_000,
  maxRequests: Number.isFinite(coalitionMax) && coalitionMax > 0 ? coalitionMax : 20,
});

const voiceMax = Number.parseInt(process.env.VOICE_RATE_LIMIT_MAX ?? '', 10);
export const voiceRateLimit = createRateLimit({
  bucket: 'voice',
  windowMs: 60_000,
  maxRequests: Number.isFinite(voiceMax) && voiceMax > 0 ? voiceMax : 10,
});

const adminOpMax = Number.parseInt(process.env.ADMIN_RATE_LIMIT_MAX ?? '', 10);
export const adminRateLimit = createRateLimit({
  bucket: 'admin-op',
  windowMs: 60_000,
  maxRequests: Number.isFinite(adminOpMax) && adminOpMax > 0 ? adminOpMax : 10,
});
