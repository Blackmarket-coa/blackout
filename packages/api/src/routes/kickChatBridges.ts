import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { authRateLimit } from '../middleware/rate-limit';
import {
  createBridge,
  deleteBridge,
  listBridgesForUser,
} from '../services/kickChatBridge';

const bridges = new Hono();
bridges.use('/', authRateLimit);
bridges.use('/:id', authRateLimit);

const createSchema = z.object({
  kickChatroomId: z.string().min(1).max(64),
  matrixRoomId: z.string().min(1).max(255),
});

bridges.get('/', (c) => {
  const userOrResp = requireUser(c, 'Sign in required to list Kick chat bridges');
  if (userOrResp instanceof Response) return userOrResp;
  return c.json({ bridges: listBridgesForUser(userOrResp.sub) });
});

bridges.post('/', async (c) => {
  const userOrResp = requireUser(c, 'Sign in required to create a Kick chat bridge');
  if (userOrResp instanceof Response) return userOrResp;
  const parsed = await readJsonBody(c, createSchema);
  if (parsed instanceof Response) return parsed;
  const out = createBridge({
    blackoutUserId: userOrResp.sub,
    kickChatroomId: parsed.kickChatroomId,
    matrixRoomId: parsed.matrixRoomId,
  });
  switch (out.kind) {
    case 'ok':
      return c.json({ bridge: out.record }, 201);
    case 'already_bridged':
      return c.json(
        {
          code: 'already_bridged',
          message: `Chatroom ${out.record.kickChatroomId} is already bridged into a different room. Delete the existing bridge first.`,
          existing: out.record,
        },
        409,
      );
    case 'invalid_input':
      return c.json({ code: 'invalid_input', message: out.reason }, 400);
    default: {
      const exhaustive: never = out;
      return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
    }
  }
});

bridges.delete('/:id', (c) => {
  const userOrResp = requireUser(c, 'Sign in required to delete a Kick chat bridge');
  if (userOrResp instanceof Response) return userOrResp;
  const id = c.req.param('id');
  const out = deleteBridge(userOrResp.sub, id);
  switch (out.kind) {
    case 'ok':
      return c.json({ ok: true });
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

export default bridges;
