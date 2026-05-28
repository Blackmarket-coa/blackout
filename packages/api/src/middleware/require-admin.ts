import type { Context } from 'hono';

const ADMIN_API_KEY = (function () {
  const key = process.env.BLACKOUT_ADMIN_API_KEY;
  if (!key) {
    throw new Error(
      'BLACKOUT_ADMIN_API_KEY environment variable is required. ' +
        'Set it to a cryptographically random string (e.g. openssl rand -hex 32).'
    );
  }
  return key;
})();

export function requireAdmin(c: Context): true | Response {
  const got = c.req.header('x-admin-api-key');
  if (!got || got !== ADMIN_API_KEY) {
    return c.json({ code: 'forbidden', message: 'Admin API key required' }, 403);
  }
  return true;
}
