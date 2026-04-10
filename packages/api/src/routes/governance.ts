import { Hono } from 'hono';
import { tallyVotes } from '@blackout/core';
import { db } from '../db/store';
import type { GovernanceProposalPayload, GovernanceVotePayload } from '@blackout/protocol';

const governance = new Hono();

governance.post('/votes', async (c) => {
  const payload = (await c.req.json()) as GovernanceProposalPayload & { communityId?: string; proposerId?: string; durationHours?: number };
  const {
    communityId,
    proposerId,
    title,
    description,
    options = [
      { id: 'yes', label: 'Yes' },
      { id: 'no', label: 'No' },
    ],
    durationHours = 168,
  } = payload;

  if (!communityId || !proposerId || !title) {
    return c.json({ error: 'communityId, proposerId and title are required' }, 400);
  }

  const vote = db.createVote({
    id: crypto.randomUUID(),
    communityId,
    proposerId,
    title,
    description,
    voteType: 'yes_no',
    options: options.map((option, index) => ({ id: option.id || String(index + 1), text: option.label })),
    requiresQuorum: 50,
    durationHours,
    status: 'active',
  });

  return c.json(vote, 201);
});

governance.post('/votes/:voteId/cast', async (c) => {
  const { voteId } = c.req.param();
  const payload = (await c.req.json()) as GovernanceVotePayload & { userId?: string; weight?: number };
  const { userId, choice, weight = 1 } = payload;
  const normalizedChoice = Array.isArray(choice) ? choice[0] : choice;

  if (!userId || !normalizedChoice) {
    return c.json({ error: 'userId and choice are required' }, 400);
  }

  const vote = db.getVote(voteId);
  if (!vote) {
    return c.json({ error: 'Vote not found' }, 404);
  }

  if (vote.status !== 'active') {
    return c.json({ error: 'Vote is not active' }, 400);
  }

  try {
    db.castVote({
      id: crypto.randomUUID(),
      voteId,
      userId,
      choice: normalizedChoice,
      weight,
    });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 400);
  }

  const tally = tallyVotes(db.getVoteEntries(voteId));
  return c.json({ success: true, tally });
});

governance.get('/votes/:voteId', (c) => {
  const { voteId } = c.req.param();
  const vote = db.getVote(voteId);

  if (!vote) {
    return c.json({ error: 'Vote not found' }, 404);
  }

  const results = tallyVotes(db.getVoteEntries(voteId));
  return c.json({ ...vote, results });
});

export default governance;
