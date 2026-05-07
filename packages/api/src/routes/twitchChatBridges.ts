import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { authRateLimit } from '../middleware/rate-limit';
import {
  createBridge,
  deleteBridge,
  listBridgesForUser,
} from '../services/twitchChatBridge';
import { log } from '../telemetry/logger';

const bridges = new Hono();

bridges.use('/', authRateLimit);
bridges.use('/:id', authRateLimit);

const createSchema = z.object({
  twitchChannel: z.string().min(1).max(64),
  matrixRoomId: z.string().min(1).max(255),
});

/** GET /v1/integrations/twitch/chat-bridges — list this creator's bridges. */
bridges.get('/', (c) => {
  const userOrResp = requireUser(c, 'Sign in required to list chat bridges');
  if (userOrResp instanceof Response) return userOrResp;
  return c.json({ bridges: listBridgesForUser(userOrResp.sub) });
});

/**
 * POST /v1/integrations/twitch/chat-bridges
 * Body: { twitchChannel, matrixRoomId }
 *
 * Idempotent: re-posting an identical (channel, room) pair returns the
 * existing record. Re-posting the same channel into a *different* room
 * returns 409 — the caller must explicitly DELETE + re-POST.
 */
bridges.post('/', async (c) => {
  const userOrResp = requireUser(c, 'Sign in required to create a chat bridge');
  if (userOrResp instanceof Response) return userOrResp;

  const parsed = await readJsonBody(c, createSchema);
  if (parsed instanceof Response) return parsed;

  try {
    const outcome = await createBridge({
      blackoutUserId: userOrResp.sub,
      twitchChannel: parsed.twitchChannel,
      matrixRoomId: parsed.matrixRoomId,
    });
    switch (outcome.kind) {
      case 'ok':
        return c.json({ bridge: outcome.record }, 201);
      case 'twitch_not_linked':
        return c.json(
          {
            code: 'twitch_not_linked',
            message: 'Link your Twitch account before creating a chat bridge.',
          },
          409,
        );
      case 'already_bridged':
        return c.json(
          {
            code: 'already_bridged',
            message: `${outcome.record.twitchChannel} is already bridged into a different room. Delete the existing bridge first.`,
            existing: outcome.record,
          },
          409,
        );
      case 'invalid_input':
        return c.json({ code: 'invalid_input', message: outcome.reason }, 400);
      default: {
        const exhaustive: never = outcome;
        return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
      }
    }
  } catch (err) {
    log.error('twitch_chat_bridge_create_failed', { userId: userOrResp.sub, error: String(err) });
    return c.json({ code: 'internal_error', message: (err as Error).message }, 500);
  }
});

/** DELETE /v1/integrations/twitch/chat-bridges/:id — stop + remove. */
bridges.delete('/:id', (c) => {
  const userOrResp = requireUser(c, 'Sign in required to delete a chat bridge');
  if (userOrResp instanceof Response) return userOrResp;
  const id = c.req.param('id');
  const outcome = deleteBridge(userOrResp.sub, id);
  switch (outcome.kind) {
    case 'ok':
      return c.json({ ok: true });
    case 'not_found':
      return c.json({ code: 'not_found', message: 'No bridge with that id.' }, 404);
    case 'forbidden':
      return c.json({ code: 'forbidden', message: 'You do not own that bridge.' }, 403);
    default: {
      const exhaustive: never = outcome;
      return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
    }
  }
});

export default bridges;
