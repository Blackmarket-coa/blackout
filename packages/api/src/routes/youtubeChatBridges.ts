import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { authRateLimit } from '../middleware/rate-limit';
import {
  createBridge,
  deleteBridge,
  listBridgesForUser,
  sendBridgeMessage,
  syncBridge,
} from '../services/youtubeChatBridge';
import { db } from '../db/store';
import { log } from '../telemetry/logger';

const bridges = new Hono();

bridges.use('/', authRateLimit);
bridges.use('/:id', authRateLimit);
bridges.use('/:id/sync', authRateLimit);
bridges.use('/:id/say', authRateLimit);

const createSchema = z.object({
  youtubeChannelId: z.string().min(1).max(64),
  matrixRoomId: z.string().min(1).max(255),
});

const saySchema = z.object({
  body: z.string().min(1).max(200),
});

bridges.get('/', (c) => {
  const userOrResp = requireUser(c, 'Sign in required to list YouTube chat bridges');
  if (userOrResp instanceof Response) return userOrResp;
  return c.json({ bridges: listBridgesForUser(userOrResp.sub) });
});

bridges.post('/', async (c) => {
  const userOrResp = requireUser(c, 'Sign in required to create a YouTube chat bridge');
  if (userOrResp instanceof Response) return userOrResp;
  const parsed = await readJsonBody(c, createSchema);
  if (parsed instanceof Response) return parsed;
  const outcome = createBridge({
    blackoutUserId: userOrResp.sub,
    youtubeChannelId: parsed.youtubeChannelId,
    matrixRoomId: parsed.matrixRoomId,
  });
  switch (outcome.kind) {
    case 'ok':
      return c.json({ bridge: outcome.record }, 201);
    case 'youtube_not_linked':
      return c.json(
        {
          code: 'youtube_not_linked',
          message: 'Link your YouTube account before creating a chat bridge.',
        },
        409,
      );
    case 'already_bridged':
      return c.json(
        {
          code: 'already_bridged',
          message: `${outcome.record.youtubeChannelId} is already bridged into a different room. Delete the existing bridge first.`,
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
});

bridges.delete('/:id', (c) => {
  const userOrResp = requireUser(c, 'Sign in required to delete a YouTube chat bridge');
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

/**
 * Manual sync trigger for a single bridge — useful when a creator just
 * went live and wants to start the chat flow before the next scheduler
 * tick. Same auth/forbidden/not-found treatment as DELETE.
 */
bridges.post('/:id/sync', async (c) => {
  const userOrResp = requireUser(c, 'Sign in required to sync a YouTube chat bridge');
  if (userOrResp instanceof Response) return userOrResp;
  const id = c.req.param('id');
  const bridge = db.getYoutubeChatBridge(id);
  if (!bridge) return c.json({ code: 'not_found', message: 'No bridge with that id.' }, 404);
  if (bridge.blackoutUserId !== userOrResp.sub) {
    return c.json({ code: 'forbidden', message: 'You do not own that bridge.' }, 403);
  }
  try {
    const outcome = await syncBridge(bridge);
    switch (outcome.kind) {
      case 'ok':
        return c.json({
          ok: true,
          messages: outcome.messages,
          delivered: outcome.delivered,
          pollingIntervalMillis: outcome.pollingIntervalMillis,
        });
      case 'no_active_broadcast':
        return c.json(
          {
            code: 'no_active_broadcast',
            message: 'YouTube reports no active broadcast for this channel.',
          },
          409,
        );
      case 'no_link':
      case 'token_unavailable':
        return c.json(
          {
            code: 'youtube_token_unavailable',
            message: 'YouTube token expired or revoked. Re-link from Settings.',
          },
          401,
        );
      case 'rate_limited':
        return c.json(
          {
            code: 'youtube_rate_limited',
            message: 'YouTube quota exhausted; retry shortly.',
            retryAfterSeconds: outcome.retryAfterSeconds,
          },
          429,
        );
      case 'failed':
        return c.json(
          { code: 'youtube_upstream_failed', status: outcome.status },
          502,
        );
      default: {
        const exhaustive: never = outcome;
        return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
      }
    }
  } catch (err) {
    log.error('youtube_chat_bridge_sync_route_threw', {
      userId: userOrResp.sub,
      bridgeId: id,
      error: String(err),
    });
    return c.json({ code: 'internal_error', message: 'An internal error occurred' }, 500);
  }
});

/**
 * POST /:id/say — outbound: send a message into the bridge's YouTube
 * live chat via liveChatMessages.insert. Mirror of the Twitch /say
 * endpoint. Auth + ownership checks identical.
 */
bridges.post('/:id/say', async (c) => {
  const userOrResp = requireUser(c, 'Sign in required to send a YouTube chat message');
  if (userOrResp instanceof Response) return userOrResp;
  const id = c.req.param('id');
  const bridge = db.getYoutubeChatBridge(id);
  if (!bridge) return c.json({ code: 'not_found', message: 'No bridge with that id.' }, 404);
  if (bridge.blackoutUserId !== userOrResp.sub) {
    return c.json({ code: 'forbidden', message: 'You do not own that bridge.' }, 403);
  }
  const parsed = await readJsonBody(c, saySchema);
  if (parsed instanceof Response) return parsed;
  try {
    const outcome = await sendBridgeMessage(bridge, parsed.body);
    switch (outcome.kind) {
      case 'ok':
        return c.json({ ok: true, messageId: outcome.messageId });
      case 'invalid_body':
        return c.json({ code: 'invalid_body', message: outcome.reason }, 400);
      case 'no_active_broadcast':
        return c.json(
          {
            code: 'no_active_broadcast',
            message: 'YouTube reports no active broadcast for this channel.',
          },
          409,
        );
      case 'no_link':
      case 'token_unavailable':
        return c.json(
          {
            code: 'youtube_token_unavailable',
            message: 'YouTube token expired or revoked. Re-link from Settings.',
          },
          401,
        );
      case 'rate_limited':
        return c.json(
          {
            code: 'youtube_rate_limited',
            message: 'YouTube quota exhausted; retry shortly.',
            retryAfterSeconds: outcome.retryAfterSeconds,
          },
          429,
        );
      case 'failed':
        return c.json({ code: 'youtube_upstream_failed', status: outcome.status }, 502);
      default: {
        const exhaustive: never = outcome;
        return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
      }
    }
  } catch (err) {
    log.error('youtube_chat_bridge_say_route_threw', {
      userId: userOrResp.sub,
      bridgeId: id,
      error: String(err),
    });
    return c.json({ code: 'internal_error', message: 'An internal error occurred' }, 500);
  }
});

export default bridges;
