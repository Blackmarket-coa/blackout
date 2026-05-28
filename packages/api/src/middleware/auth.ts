import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { db } from '../db/store';
import { readAuthRuntimeConfig, verifyJwt } from '../services/auth';

function verifyCsrf(c: Context, config: ReturnType<typeof readAuthRuntimeConfig>): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return true;
  const headerToken = c.req.header('x-csrf-token') ?? '';
  const cookieToken = getCookie(c, 'csrf-token') ?? '';
  return headerToken.length > 0 && headerToken === cookieToken;
}

export async function authMiddleware(c: Context, next: Next) {
  const config = readAuthRuntimeConfig();
  let token: string | null = null;

  if (config.tokenTransport === 'cookie' || config.tokenTransport === 'both') {
    token = getCookie(c, config.cookieName!) ?? null;
  }

  if (!token) {
    const authHeader = c.req.header('authorization') ?? '';
    token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  }

  if (!token) {
    c.set('user', null);
    await next();
    return;
  }

  const payload = verifyJwt(token);
  if (!payload) {
    return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);
  }
  if (payload.jti && db.isSessionRevoked(payload.jti)) {
    return c.json({ code: 'session_revoked', message: 'Session has been revoked' }, 401);
  }

  if ((config.tokenTransport === 'cookie' || config.tokenTransport === 'both') && !verifyCsrf(c, config)) {
    return c.json({ code: 'csrf_invalid', message: 'Double-submit CSRF token mismatch' }, 403);
  }

  c.set('user', payload);
  await next();
}
