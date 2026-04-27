import { Hono } from 'hono';
import { z } from 'zod';
import { tallyVotes } from '@blackout/core';
import { db } from '../db/store';
import { readJsonBody } from '../middleware/validate';
import { emitDomainEvent, listDomainEvents } from './domain-events';
import { requireDomainCapability } from './authz';
import type { FeatureModule } from './types';

const proposalSchema = z.object({
  communityId: z.string().min(1),
  proposerId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  options: z.array(z.object({ id: z.string().optional(), label: z.string().optional() })).optional(),
  durationHours: z.number().optional(),
});

const voteSchema = z.object({
  voteId: z.string().min(1),
  userId: z.string().min(1),
  choice: z.union([z.string().min(1), z.array(z.string()).min(1)]),
  weight: z.number().optional(),
});

function createGovernanceRouter() {
  const governance = new Hono();

  governance.post('/proposals', async (c) => {
    const denied = requireDomainCapability(c, 'governance', 'write');
    if (denied) return denied;

    const parsed = await readJsonBody(c, proposalSchema);
    if (parsed instanceof Response) return parsed;
    const { communityId, proposerId, title, description } = parsed;
    const options = parsed.options ?? [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }];
    const durationHours = parsed.durationHours ?? 168;

    const proposal = db.createVote({
      id: crypto.randomUUID(),
      communityId,
      proposerId,
      title,
      description,
      voteType: 'yes_no',
      options: options.map((option, index) => ({ id: option.id || String(index + 1), text: option.label || `Option ${index + 1}` })),
      requiresQuorum: 50,
      durationHours,
      status: 'active',
    });

    const event = emitDomainEvent({ module: 'governance', type: 'governance.proposal.created', payload: { proposalId: proposal.id, communityId } });

    return c.json({ ...proposal, event }, 201);
  });

  governance.post('/votes', async (c) => {
    const denied = requireDomainCapability(c, 'governance', 'write');
    if (denied) return denied;

    const parsed = await readJsonBody(c, voteSchema);
    if (parsed instanceof Response) return parsed;
    const { voteId, userId, choice } = parsed;
    const weight = parsed.weight ?? 1;
    const normalizedChoice = Array.isArray(choice) ? choice[0] : choice;

    const vote = db.getVote(voteId);
    if (!vote) {
      return c.json({ code: 'vote_not_found', message: 'Vote not found' }, 404);
    }

    try {
      db.castVote({ id: crypto.randomUUID(), voteId, userId, choice: normalizedChoice, weight });
    } catch (error) {
      return c.json({ code: 'invalid_request', message: (error as Error).message }, 400);
    }

    const tally = tallyVotes(db.getVoteEntries(voteId));
    const event = emitDomainEvent({ module: 'governance', type: 'governance.vote.cast', payload: { voteId, userId, choice: normalizedChoice } });
    return c.json({ success: true, tally, event });
  });

  governance.get('/proposals/:proposalId', (c) => {
    const denied = requireDomainCapability(c, 'governance', 'read');
    if (denied) return denied;

    const { proposalId } = c.req.param();
    const vote = db.getVote(proposalId);
    if (!vote) return c.json({ code: 'proposal_not_found', message: 'Proposal not found' }, 404);

    return c.json({ ...vote, results: tallyVotes(db.getVoteEntries(proposalId)) });
  });

  governance.get('/events', (c) => {
    const denied = requireDomainCapability(c, 'governance', 'read');
    if (denied) return denied;

    return c.json(listDomainEvents('governance'));
  });

  return governance;
}

export const governanceModule: FeatureModule = {
  id: 'governance',
  mountPath: '/governance',
  registerRoutes: createGovernanceRouter,
};
