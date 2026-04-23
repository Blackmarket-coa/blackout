import type { Context, Next } from 'hono';

export interface RateLimitOptions {
  bucket: string;
  windowMs: number;
  maxRequests: number;
}

const buckets = new Map<string, Map<string, Array<number>>>();

function getBucket(name: string): Map<string, Array<number>> {
  let bucket = buckets.get(name);
  if (!bucket) {
    bucket = new Map();
    buckets.set(name, bucket);
  }
  return bucket;
}

export function createRateLimit(options: RateLimitOptions) {
  const { bucket, windowMs, maxRequests } = options;
  return async function rateLimitMiddleware(c: Context, next: Next) {
    const key = c.req.header('x-forwarded-for') ?? 'local';
    const store = getBucket(bucket);
    const now = Date.now();
    const history = (store.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);

    if (history.length >= maxRequests) {
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }

    history.push(now);
    store.set(key, history);

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
