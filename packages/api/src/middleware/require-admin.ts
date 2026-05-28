import type { Context } from 'hono';

const ADMIN_API_KEY = process.env.BLACKOUT_ADMIN_API_KEY;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !ADMIN_API_KEY) {
  throw new Error(
    'BLACKOUT_ADMIN_API_KEY is required in production. ' +
      'Set it to a cryptographically random string (e.g. openssl rand -hex 32).'
  );
}

export function requireAdmin(c: Context): true | Response {
  // Dev mode with no key configured: allow through (no sensitive data in dev).
  // Production requires the key to be set and validated.
  if (!ADMIN_API_KEY) return true;

  const got = c.req.header('x-admin-api-key');
  if (!got || got !== ADMIN_API_KEY) {
    return c.json({ code: 'forbidden', message: 'Admin API key required' }, 403);
  }
  return true;
}
