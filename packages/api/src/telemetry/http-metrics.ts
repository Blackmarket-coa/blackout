import type { Context, Next } from 'hono';
import { httpRequestDuration, httpRequestsTotal } from './metrics';

/**
 * Records request duration and counts on the default registry. Uses the
 * matched route pattern (`c.req.routePath`) when available so high-cardinality
 * dynamic segments do not blow up label cardinality. Falls back to the literal
 * path only when no pattern is matched.
 */
export const httpMetricsMiddleware = async (c: Context, next: Next): Promise<void> => {
  const start = process.hrtime.bigint();
  let status = 0;
  try {
    await next();
    status = c.res?.status ?? 200;
  } catch (err) {
    status = 500;
    throw err;
  } finally {
    const elapsedNs = Number(process.hrtime.bigint() - start);
    const seconds = elapsedNs / 1e9;
    const method = c.req.method.toUpperCase();
    const route = (c.req as unknown as { routePath?: string }).routePath ?? c.req.path;
    const labels = { method, route, status: String(status) };
    httpRequestDuration.observe(seconds, labels);
    httpRequestsTotal.inc(labels);
  }
};
