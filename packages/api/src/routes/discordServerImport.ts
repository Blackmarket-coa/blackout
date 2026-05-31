import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { authRateLimit } from '../middleware/rate-limit';
import {
  applyImport,
  getImport,
  listGuilds,
  listImportsForUser,
  startImport,
} from '../services/discordServerImport';
import { log } from '../telemetry/logger';

/**
 * Migration Hub — Discord server import. Reads the linked user's Discord guild
 * structure and maps it into Blackout (space + dens + role intents).
 *
 *   GET    /discord-import/guilds        — importable guilds (OAuth preview)
 *   GET    /discord-import/imports       — this user's import jobs
 *   POST   /discord-import/imports       — start/refresh an import for a guild
 *   GET    /discord-import/imports/:id   — one import job + its mappings
 *   POST   /discord-import/imports/:id/apply — idempotently materialize it
 */

const router = new Hono();
router.use('/guilds', authRateLimit);
router.use('/imports', authRateLimit);
router.use('/imports/:id/apply', authRateLimit);

const startSchema = z.object({ guildId: z.string().min(1).max(64) });

// Maps a guild-read / snapshot failure onto an HTTP response. Shared by the
// list, start, and apply handlers since they surface the same Discord errors.
const respondGuildError = (
  c: Context,
  outcome: { kind: string; status?: number; detail?: string },
): Response => {
  switch (outcome.kind) {
    case 'not_linked':
      return c.json(
        { code: 'not_linked', message: 'Link your Discord account first to import a server.' },
        409,
      );
    case 'insufficient_scope':
      return c.json(
        {
          code: 'insufficient_scope',
          message:
            'Your Discord link is missing the "guilds" scope. Re-link Discord and grant server access.',
        },
        403,
      );
    case 'guild_not_found':
      return c.json(
        { code: 'guild_not_found', message: 'That guild is not in your importable server list.' },
        404,
      );
    case 'not_manageable':
      return c.json(
        {
          code: 'not_manageable',
          message: 'You must own or have Manage Server on a guild to import it.',
        },
        403,
      );
    case 'discord_error':
      return c.json(
        { code: 'discord_error', message: 'Discord rejected the request.', status: outcome.status },
        502,
      );
    default:
      return c.json({ code: 'unexpected_outcome', message: outcome.kind }, 500);
  }
};

router.get('/guilds', async (c) => {
  const userOrResp = requireUser(c, 'Sign in required to list Discord servers');
  if (userOrResp instanceof Response) return userOrResp;
  try {
    const out = await listGuilds(userOrResp.sub);
    if (out.kind === 'ok') return c.json({ guilds: out.guilds });
    return respondGuildError(c, out);
  } catch (err) {
    log.error('discord_import_list_guilds_failed', { error: String(err), userId: userOrResp.sub });
    return c.json({ code: 'discord_unavailable', message: 'Could not reach Discord.' }, 503);
  }
});

router.get('/imports', (c) => {
  const userOrResp = requireUser(c, 'Sign in required to list imports');
  if (userOrResp instanceof Response) return userOrResp;
  return c.json({ imports: listImportsForUser(userOrResp.sub) });
});

router.post('/imports', async (c) => {
  const userOrResp = requireUser(c, 'Sign in required to start an import');
  if (userOrResp instanceof Response) return userOrResp;
  const parsed = await readJsonBody(c, startSchema);
  if (parsed instanceof Response) return parsed;
  try {
    const out = await startImport(userOrResp.sub, parsed.guildId);
    if (out.kind === 'ok') {
      return c.json({ import: out.record, snapshot: out.snapshot }, 201);
    }
    return respondGuildError(c, out);
  } catch (err) {
    log.error('discord_import_start_failed', { error: String(err), userId: userOrResp.sub });
    return c.json({ code: 'discord_unavailable', message: 'Could not reach Discord.' }, 503);
  }
});

router.get('/imports/:id', (c) => {
  const userOrResp = requireUser(c, 'Sign in required to view an import');
  if (userOrResp instanceof Response) return userOrResp;
  const found = getImport(userOrResp.sub, c.req.param('id'));
  if (!found) return c.json({ code: 'not_found', message: 'No import with that id.' }, 404);
  return c.json(found);
});

router.post('/imports/:id/apply', async (c) => {
  const userOrResp = requireUser(c, 'Sign in required to apply an import');
  if (userOrResp instanceof Response) return userOrResp;
  try {
    const out = await applyImport(userOrResp.sub, c.req.param('id'));
    switch (out.kind) {
      case 'ok':
        return c.json({ import: out.record, summary: out.summary });
      case 'not_found':
        return c.json({ code: 'not_found', message: 'No import with that id.' }, 404);
      case 'forbidden':
        return c.json({ code: 'forbidden', message: 'You do not own that import.' }, 403);
      case 'matrix_failed':
        return c.json(
          { code: 'matrix_failed', message: 'Could not create the Blackout space/dens.', reason: out.reason },
          502,
        );
      default:
        return respondGuildError(c, out);
    }
  } catch (err) {
    log.error('discord_import_apply_failed', { error: String(err), userId: userOrResp.sub });
    return c.json({ code: 'discord_unavailable', message: 'Could not reach Discord.' }, 503);
  }
});

export default router;
