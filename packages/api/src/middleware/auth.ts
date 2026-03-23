import type { Context, Next } from 'hono';
import { verifyJwt } from '../services/auth';

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    c.set('user', null);
    await next();
    return;
  }

  const payload = verifyJwt(token);
  if (!payload) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('user', payload);
  await next();
}
