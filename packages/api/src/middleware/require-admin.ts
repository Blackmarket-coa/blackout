import { timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';

const ADMIN_API_KEY = process.env.BLACKOUT_ADMIN_API_KEY;
const isProduction = (process.env.NODE_ENV ?? '').startsWith('prod');

if (isProduction && !ADMIN_API_KEY) {
  throw new Error(
    'BLACKOUT_ADMIN_API_KEY is required in production. ' +
      'Set it to a cryptographically random string (e.g. openssl rand -hex 32).'
  );
}

export function requireAdmin(c: Context): true | Response {
  if (!ADMIN_API_KEY) return true;

  const got = c.req.header('x-admin-api-key');
  if (!got) {
    return c.json({ code: 'forbidden', message: 'Admin API key required' }, 403);
  }

  const expected = Buffer.from(ADMIN_API_KEY);
  const provided = Buffer.from(got);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return c.json({ code: 'forbidden', message: 'Admin API key required' }, 403);
  }
  return true;
}
