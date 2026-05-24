import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import { matrixClient } from '../integrations/matrix-client';
import { requireUser } from '../middleware/require-user';
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
 * full user ids). Layered on top of `requireUser`, so an unauthenticated caller
 * gets 401 and a non-admin gets 403.
 */
const adminAllowlist = (): Set<string> =>
  new Set(
    (process.env.BLACKOUT_ADMIN_USERS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );

const requireAdmin = (c: Context) => {
  const user = requireUser(c, 'Sign in required');
  if (user instanceof Response) return user;
  const allow = adminAllowlist();
  if (!allow.has(user.username) && !allow.has(user.sub)) {
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

  const parsed = await readOptionalBody(c, deactivateSchema);
  if (parsed instanceof Response) return parsed;
  const userId = c.req.param('userId');

  const result = await matrixClient.deactivateUser(userId, parsed.erase ?? false);
  if (!result.ok) return matrixUnavailable(c, result);
  log.info('admin.user_deactivated', { actor: user.username, userId, erase: parsed?.erase ?? false });
  return c.json({ ok: true });
});

const purgeSchema = z.object({ block: z.boolean().optional(), purge: z.boolean().optional() });

admin.post('/rooms/:roomId/purge', async (c) => {
  const user = requireAdmin(c);
  if (user instanceof Response) return user;

  const parsed = await readOptionalBody(c, purgeSchema);
  if (parsed instanceof Response) return parsed;
  const roomId = c.req.param('roomId');

  const result = await matrixClient.purgeRoom(roomId, {
    block: parsed.block ?? false,
    purge: parsed.purge ?? true,
  });
  if (!result.ok) return matrixUnavailable(c, result);
  log.info('admin.room_purged', { actor: user.username, roomId, deleteId: result.deleteId });
  return c.json({ ok: true, deleteId: result.deleteId });
});

export default admin;
