import type { Context, Next } from 'hono';
import { db } from '../db/store';
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
        return c.json({ code: 'unauthorized', message: 'Unauthorized' }, 401);
    }
    if (payload.jti && db.isSessionRevoked(payload.jti)) {
        return c.json({ code: 'session_revoked', message: 'Session has been revoked' }, 401);
    }
    // Per-user "logout everywhere" cutoff: reject access tokens minted before the
    // user's last revoke-all / refresh-token-reuse event, even though the JWT
    // signature and exp are still valid.
    if (payload.iat < db.getUserTokenRevocationCutoff(payload.sub)) {
        return c.json({ code: 'session_revoked', message: 'Session has been revoked' }, 401);
    }

    c.set('user', payload);
    await next();
}
