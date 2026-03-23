import { Hono } from 'hono';
import { tallyVotes } from '@blackout/core';

const governance = new Hono();

const votes = new Map<string, Array<{ userId: string; choice: string }>>();

governance.post('/votes', async (c) => {
  const { title, options = ['yes', 'no'] } = await c.req.json();
  const voteId = crypto.randomUUID();
  votes.set(voteId, []);

  return c.json({ voteId, title, options }, 201);
});

governance.post('/votes/:voteId/cast', async (c) => {
  const { voteId } = c.req.param();
  const { userId, choice } = await c.req.json();
  const entries = votes.get(voteId) ?? [];

  if (entries.find((entry) => entry.userId === userId)) {
    return c.json({ error: 'You have already voted' }, 400);
  }

  entries.push({ userId, choice });
  votes.set(voteId, entries);

  return c.json({ success: true, tally: tallyVotes(entries) });
});

governance.get('/votes/:voteId', (c) => {
  const { voteId } = c.req.param();
  const entries = votes.get(voteId) ?? [];

  return c.json({ voteId, results: tallyVotes(entries) });
});

export default governance;
