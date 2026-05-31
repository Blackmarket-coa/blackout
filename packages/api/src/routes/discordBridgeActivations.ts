import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { authRateLimit } from '../middleware/rate-limit';
import {
  BRIDGE_MODES,
  createActivation,
  deleteActivation,
  listActivationsForUser,
  setMode,
} from '../services/discordBridgeActivation';

/**
 * Migration Hub — Discord bridge activations. Product-level control over the
 * mautrix-discord appservice link for a den ↔ Discord channel pair.
 *
 *   GET    /                — this user's activations
 *   POST   /                — activate a bridge (mode: one-way|two-way|read-only)
 *   PATCH  /:id             — change the bridge mode
 *   DELETE /:id             — tear the bridge down
 */

const router = new Hono();
router.use('/', authRateLimit);
router.use('/:id', authRateLimit);

const createSchema = z.object({
  matrixRoomId: z.string().min(1).max(255),
  discordGuildId: z.string().min(1).max(64),
  discordChannelId: z.string().min(1).max(64),
  mode: z.enum(BRIDGE_MODES as unknown as [string, ...string[]]),
});

const patchSchema = z.object({
  mode: z.enum(BRIDGE_MODES as unknown as [string, ...string[]]),
});

router.get('/', (c) => {
  const userOrResp = requireUser(c, 'Sign in required to list Discord bridges');
  if (userOrResp instanceof Response) return userOrResp;
  return c.json({ activations: listActivationsForUser(userOrResp.sub), modes: BRIDGE_MODES });
});

router.post('/', async (c) => {
  const userOrResp = requireUser(c, 'Sign in required to activate a Discord bridge');
  if (userOrResp instanceof Response) return userOrResp;
  const parsed = await readJsonBody(c, createSchema);
  if (parsed instanceof Response) return parsed;
  const out = await createActivation({
    blackoutUserId: userOrResp.sub,
    matrixRoomId: parsed.matrixRoomId,
    discordGuildId: parsed.discordGuildId,
    discordChannelId: parsed.discordChannelId,
    mode: parsed.mode as (typeof BRIDGE_MODES)[number],
  });
  switch (out.kind) {
    case 'ok':
      return c.json({ activation: out.record }, 201);
    case 'already_bridged':
      return c.json(
        {
          code: 'already_bridged',
          message: 'That den is already bridged to this Discord channel.',
          existing: out.record,
        },
        409,
      );
    case 'invalid_input':
      return c.json({ code: 'invalid_input', message: out.reason }, 400);
    case 'bridge_unavailable':
      return c.json({ code: 'bridge_unavailable', message: out.reason }, 502);
    default: {
      const exhaustive: never = out;
      return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
    }
  }
});

router.patch('/:id', async (c) => {
  const userOrResp = requireUser(c, 'Sign in required to change a Discord bridge');
  if (userOrResp instanceof Response) return userOrResp;
  const parsed = await readJsonBody(c, patchSchema);
  if (parsed instanceof Response) return parsed;
  const out = await setMode(
    userOrResp.sub,
    c.req.param('id'),
    parsed.mode as (typeof BRIDGE_MODES)[number],
  );
  switch (out.kind) {
    case 'ok':
      return c.json({ activation: out.record });
    case 'not_found':
      return c.json({ code: 'not_found', message: 'No bridge with that id.' }, 404);
    case 'forbidden':
      return c.json({ code: 'forbidden', message: 'You do not own that bridge.' }, 403);
    case 'invalid_input':
      return c.json({ code: 'invalid_input', message: out.reason }, 400);
    case 'bridge_unavailable':
      return c.json({ code: 'bridge_unavailable', message: out.reason }, 502);
    default: {
      const exhaustive: never = out;
      return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
    }
  }
});

router.delete('/:id', async (c) => {
  const userOrResp = requireUser(c, 'Sign in required to delete a Discord bridge');
  if (userOrResp instanceof Response) return userOrResp;
  const out = await deleteActivation(userOrResp.sub, c.req.param('id'));
  switch (out.kind) {
    case 'ok':
      return c.json({ ok: true, unbridged: out.unbridged });
    case 'not_found':
      return c.json({ code: 'not_found', message: 'No bridge with that id.' }, 404);
    case 'forbidden':
      return c.json({ code: 'forbidden', message: 'You do not own that bridge.' }, 403);
    default: {
      const exhaustive: never = out;
      return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
    }
  }
});

export default router;
