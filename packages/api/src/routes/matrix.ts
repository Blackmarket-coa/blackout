import { Hono } from 'hono';
import { requireUser } from '../middleware/require-user';
import { matrixClient } from '../integrations/matrix-client';

const matrix = new Hono();

/**
 * Expose the BlackOut bot's Matrix user id so an authenticated client can
 * invite it into a den it owns (the only actor with power to add the bot to a
 * private room). The server then force-joins the bot when the matching invite
 * link is created. The MXID is public information — no secret is leaked.
 */
matrix.get('/bot', async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const userId = await matrixClient.botUserId();
  if (!userId) {
    return c.json({ code: 'matrix_not_configured', message: 'Matrix bot is not configured.' }, 503);
  }
  return c.json({ userId });
});

export default matrix;
