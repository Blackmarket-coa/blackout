import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { authRateLimit } from '../middleware/rate-limit';
import {
  listForUser,
  mint,
  projectRecord,
  revoke,
} from '../services/twitchIrcBotTokens';

const router = new Hono();
router.use('/', authRateLimit);
router.use('/:id', authRateLimit);

const mintSchema = z.object({
  label: z.string().min(1).max(80).optional(),
  /** Channel-id scope; empty/omitted = all channels owned by the creator. */
  scopes: z.array(z.string().min(1).max(255)).max(50).optional(),
});

router.get('/', (c) => {
  const userOrResp = requireUser(c, 'Sign in required to list Twitch IRC bot tokens');
  if (userOrResp instanceof Response) return userOrResp;
  return c.json({ tokens: listForUser(userOrResp.sub).map(projectRecord) });
});

router.post('/', async (c) => {
  const userOrResp = requireUser(c, 'Sign in required to mint a Twitch IRC bot token');
  if (userOrResp instanceof Response) return userOrResp;
  const parsed = await readJsonBody(c, mintSchema);
  if (parsed instanceof Response) return parsed;

  const out = mint({
    blackoutUserId: userOrResp.sub,
    label: parsed.label,
    scopes: parsed.scopes,
  });
  switch (out.kind) {
    case 'ok':
      // The plaintext bearer is shown ONCE — UI must surface a copy banner.
      // Bots paste it into their "OAuth Token" config field; format as
      // `oauth:<plaintext>` per the Twitch convention.
      return c.json(
        {
          token: projectRecord(out.record),
          secret: out.secret,
          passLine: `oauth:${out.secret}`,
        },
        201,
      );
    case 'invalid_input':
      return c.json({ code: 'invalid_input', message: out.reason }, 400);
    default: {
      const exhaustive: never = out;
      return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
    }
  }
});

router.delete('/:id', (c) => {
  const userOrResp = requireUser(c, 'Sign in required to revoke a Twitch IRC bot token');
  if (userOrResp instanceof Response) return userOrResp;
  const id = c.req.param('id');
  const reason = c.req.query('reason') || 'user_revoked';
  const out = revoke(userOrResp.sub, id, reason);
  switch (out.kind) {
    case 'ok':
      return c.json({ token: projectRecord(out.record) });
    case 'not_found':
      return c.json({ code: 'not_found', message: 'No token with that id.' }, 404);
    case 'forbidden':
      return c.json({ code: 'forbidden', message: 'You do not own that token.' }, 403);
    default: {
      const exhaustive: never = out;
      return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
    }
  }
});

export default router;
