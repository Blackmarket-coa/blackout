import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import { matrixClient } from '../integrations/matrix-client';
import { requireUser } from '../middleware/require-user';
import { isAdminUser } from '../services/auth';
import { requireDestructiveConfirm, type DestructiveAction } from '../middleware/require-destructive-confirm';
import { log } from '../telemetry/logger';

/**
 * Parse an optional JSON body against a schema. Unlike `readJsonBody`, a
 * missing/empty body is treated as `{}` rather than a 400 — the
 * deactivate/purge actions carry only optional flags.
 */
const readOptionalBody = async <T>(c: Context, schema: z.ZodType<T>): Promise<T | Response> => {
  let raw: unknown = {};
  try {
    raw = await c.req.json();
  } catch {
    raw = {};
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return c.json({ code: 'invalid_request', message: 'Request body failed validation' }, 400);
  }
  return result.data;
};

const admin = new Hono();

/**
 * Server-side admin gate. The client `platform-ops.admin` capability controls
 * UI visibility only — it is NOT authorization. Admin operations are gated here
 * against the `BLACKOUT_ADMIN_USERS` allowlist (comma-separated usernames or
 * full user ids), shared with capability minting via `isAdminUser`. Layered on
 * top of `requireUser`, so an unauthenticated caller gets 401 and a non-admin
 * gets 403.
 */
const requireAdmin = (c: Context) => {
  const user = requireUser(c, 'Sign in required');
  if (user instanceof Response) return user;
  if (!isAdminUser(user.sub, user.username)) {
    return c.json({ code: 'forbidden', message: 'Admin privileges required' }, 403);
  }
  return user;
};

const matrixUnavailable = (c: Context, result: { reason?: string }) =>
  c.json(
    {
      code: result.reason === 'matrix_not_configured' ? 'matrix_not_configured' : 'matrix_error',
      message:
        result.reason === 'matrix_not_configured'
          ? 'Matrix homeserver is not configured'
          : 'Matrix admin operation failed',
    },
    result.reason === 'matrix_not_configured' ? 503 : 502
  );

admin.get('/stats', async (c) => {
  const user = requireAdmin(c);
  if (user instanceof Response) return user;

  const stats = await matrixClient.serverStats();
  if (!stats.ok) return matrixUnavailable(c, stats);
  return c.json({ totalUsers: stats.totalUsers, totalRooms: stats.totalRooms });
});

admin.get('/users', async (c) => {
  const user = requireAdmin(c);
  if (user instanceof Response) return user;

  const search = c.req.query('search') ?? undefined;
  const limitRaw = Number.parseInt(c.req.query('limit') ?? '', 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

  const result = await matrixClient.listUsers({ search, limit });
  if (!result.ok) return matrixUnavailable(c, result);
  return c.json({ users: result.users, total: result.total });
});

const deactivateSchema = z.object({ erase: z.boolean().optional() });

admin.post('/users/:userId/deactivate', async (c) => {
  const user = requireAdmin(c);
  if (user instanceof Response) return user;
  const userId = c.req.param('userId');

  const confirm = requireDestructiveConfirm(c, 'deactivate_user', userId);
  if (confirm !== true) return confirm;

  const parsed = await readOptionalBody(c, deactivateSchema);
  if (parsed instanceof Response) return parsed;

  const result = await matrixClient.deactivateUser(userId, parsed.erase ?? false);
  if (!result.ok) return matrixUnavailable(c, result);
  log.info('admin.user_deactivated', { actor: user.username, userId, erase: parsed?.erase ?? false });
  return c.json({ ok: true });
});

const purgeSchema = z.object({ block: z.boolean().optional(), purge: z.boolean().optional() });

admin.post('/rooms/:roomId/purge', async (c) => {
  const user = requireAdmin(c);
  if (user instanceof Response) return user;
  const roomId = c.req.param('roomId');

  const confirm = requireDestructiveConfirm(c, 'purge_room', roomId);
  if (confirm !== true) return confirm;

  const parsed = await readOptionalBody(c, purgeSchema);
  if (parsed instanceof Response) return parsed;

  const result = await matrixClient.purgeRoom(roomId, {
    block: parsed.block ?? false,
    purge: parsed.purge ?? true,
  });
  if (!result.ok) return matrixUnavailable(c, result);
  log.info('admin.room_purged', { actor: user.username, roomId, deleteId: result.deleteId });
  return c.json({ ok: true, deleteId: result.deleteId });
});

const confirmRequestSchema = z.object({
  action: z.enum(['deactivate_user', 'purge_room'] as const),
  targetId: z.string().min(1),
  ttlSeconds: z.number().int().min(10).max(300).optional(),
});

/**
 * Request a short-lived confirmation token for a destructive action.
 * The token must be passed as `X-Destructive-Confirm` header to the
 * corresponding destructive endpoint within the TTL window.
 */
admin.post('/destructive-action/request', async (c) => {
  const user = requireAdmin(c);
  if (user instanceof Response) return user;

  const parsed = await readOptionalBody(c, confirmRequestSchema);
  if (parsed instanceof Response) return parsed;

  const ttl = parsed.ttlSeconds ?? 60;
  const { createHmac } = await import('node:crypto');
  const { randomBytes } = await import('node:crypto');
  const { readAuthRuntimeConfig } = await import('../services/auth');

  const config = readAuthRuntimeConfig();
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttl;
  const jti = randomBytes(16).toString('base64url');

  const payload = {
    sub: user.sub,
    username: user.username,
    purpose: 'destructive-confirm',
    action: parsed.action,
    targetId: parsed.targetId,
    iat,
    exp,
    jti,
    iss: config.issuer,
    aud: config.audience,
  };

  const base64Url = (input: Buffer | string) => Buffer.from(input).toString('base64url');
  const encodedHeader = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', config.signingSecret).update(signingInput).digest('base64url');
  const token = `${signingInput}.${signature}`;

  log.warn('destructive_confirm_issued', {
    action: parsed.action,
    targetId: parsed.targetId,
    adminUser: user.username,
    ttlSeconds: ttl,
  });

  return c.json({
    confirmToken: token,
    action: parsed.action,
    targetId: parsed.targetId,
    expiresAt: new Date(exp * 1000).toISOString(),
  });
});

export default admin;
