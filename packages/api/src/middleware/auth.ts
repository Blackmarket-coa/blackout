import type { Context, Next } from 'hono';
import { db } from '../db/store';
import { readAuthRuntimeConfig, verifyJwt } from '../services/auth';

export async function authMiddleware(c: Context, next: Next) {
  const config = readAuthRuntimeConfig();
  let token: string | null = null;

  if (config.tokenTransport === 'cookie' || config.tokenTransport === 'both') {
    token = c.req.cookie(config.cookieName!) ?? null;
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

  c.set('user', payload);
  await next();
}
