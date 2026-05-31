import { Hono } from 'hono';
import { requireUser } from '../middleware/require-user';
import { buildDashboard } from '../services/migrationDashboard';
import { log } from '../telemetry/logger';

/**
 * Migration Hub — adoption dashboard.
 *
 *   GET /dashboard?guildId=<id>
 *
 * Read-only snapshot of migration progress for one Discord guild. Mirrors the
 * integrations-health route: cheap in-memory walk + at most one Discord call.
 */
const router = new Hono();

router.get('/dashboard', async (c) => {
  const userOrResp = requireUser(c, 'Sign in required to view the migration dashboard');
  if (userOrResp instanceof Response) return userOrResp;

  const guildId = c.req.query('guildId');
  if (!guildId) {
    return c.json({ code: 'guild_id_required', message: 'guildId query parameter is required.' }, 400);
  }

  try {
    const out = await buildDashboard(userOrResp.sub, guildId);
    switch (out.kind) {
      case 'ok':
        return c.json(out.dashboard);
      case 'not_linked':
        return c.json(
          { code: 'not_linked', message: 'Link your Discord account to view the dashboard.' },
          409,
        );
      case 'insufficient_scope':
        return c.json(
          {
            code: 'insufficient_scope',
            message: 'Your Discord link is missing the "guilds" scope. Re-link Discord.',
          },
          403,
        );
      case 'discord_error':
        return c.json(
          { code: 'discord_error', message: 'Discord rejected the request.', status: out.status },
          502,
        );
      default: {
        const exhaustive: never = out;
        return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
      }
    }
  } catch (err) {
    log.error('migration_dashboard_failed', { error: String(err), userId: userOrResp.sub });
    return c.json({ code: 'discord_unavailable', message: 'Could not reach Discord.' }, 503);
  }
});

export default router;
