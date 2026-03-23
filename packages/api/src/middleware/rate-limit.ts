import type { Context, Next } from 'hono';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 120;

const requests = new Map<string, Array<number>>();

export async function rateLimit(c: Context, next: Next) {
  const key = c.req.header('x-forwarded-for') ?? 'local';
  const now = Date.now();
  const history = (requests.get(key) ?? []).filter((timestamp) => now - timestamp < WINDOW_MS);

  if (history.length >= MAX_REQUESTS_PER_WINDOW) {
    return c.json({ error: 'Rate limit exceeded' }, 429);
  }

  history.push(now);
  requests.set(key, history);

  await next();
}
