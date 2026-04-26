import { Hono } from 'hono';
import { tallyVotes } from '@blackout/core';
import { db } from '../db/store';
import { emitDomainEvent, listDomainEvents } from './domain-events';
import { requireDomainCapability } from './authz';
import type { FeatureModule } from './types';

function createGovernanceRouter() {
  const governance = new Hono();

  governance.post('/proposals', async (c) => {
    const denied = requireDomainCapability(c, 'governance', 'write');
    if (denied) return denied;

    const payload = (await c.req.json()) as {
      communityId?: string;
      proposerId?: string;
      title?: string;
      description?: string;
      options?: Array<{ id?: string; label?: string }>;
      durationHours?: number;
    };

    const { communityId, proposerId, title, description, options = [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }], durationHours = 168 } = payload;

    if (!communityId || !proposerId || !title) {
      return c.json({ code: 'invalid_request', message: 'communityId, proposerId and title are required' }, 400);
    }

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

    const payload = (await c.req.json()) as { voteId?: string; userId?: string; choice?: string | string[]; weight?: number };
    const { voteId, userId, choice, weight = 1 } = payload;
    const normalizedChoice = Array.isArray(choice) ? choice[0] : choice;

    if (!voteId || !userId || !normalizedChoice) {
      return c.json({ code: 'invalid_request', message: 'voteId, userId and choice are required' }, 400);
    }

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
