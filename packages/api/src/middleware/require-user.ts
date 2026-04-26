import type { Context } from 'hono';
import type { AuthTokenPayload } from '../services/auth';

export function getAuthUser(c: Context): AuthTokenPayload | null {
  const user = c.get('user') as AuthTokenPayload | null | undefined;
  return user?.sub ? user : null;
}

export function requireUser(
  c: Context,
  message = 'Sign in required',
): AuthTokenPayload | Response {
  const user = getAuthUser(c);
  if (!user) {
    return c.json({ code: 'unauthorized', message }, 401);
  }
  return user;
}
