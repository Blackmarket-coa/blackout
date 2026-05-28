/**
 * WHAT THIS FILE DOES
 * Governance/voting system — users create proposals and cast votes.
 * Behind the scenes, each vote is stored with a hash chain for
 * tamper evidence, and the audit endpoint lets anyone verify that
 * no votes were modified after the fact.
 *
 * WHY IT EXISTS (THE SECURITY PROBLEM)
 * Three critical issues were in this file:
 * 1. (IDOR) `userId` and `proposerId` came from the UNTRUSTED request
 *    body — an attacker could vote or create proposals as ANY user
 *    just by changing these fields in their request.
 * 2. No vote expiry check — users could vote on proposals long after
 *    the voting period ended.
 * 3. Error messages leaked user activity — "You have already voted"
 *    told an attacker which accounts had voted on which proposals.
 *
 * KEY CONCEPT — IDOR (Insecure Direct Object Reference)
 * When a user supplies an ID (like userId) in their request body and
 * the server trusts it without verifying against the authenticated
 * session. Fixed by reading `userId` from the JWT (which we verified),
 * not from the body (which anyone can forge).
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { tallyVotes } from '@blackout/core';
import { verifyAuditChain } from '@blackout/core';
import { db } from '../db/store';
import { readJsonBody } from '../middleware/validate';
import { emitDomainEvent, listDomainEvents } from './domain-events';
import { requireDomainCapability, getAuthenticatedUserId } from './authz';
import {
    cancelMeeting,
    getLatestTreasurySnapshot,
    listMeetings,
    listTreasurySnapshots,
    publishTreasurySnapshot,
    upsertMeeting,
} from '../services/governanceStore';
import type { FeatureModule } from './types';

const proposalSchema = z.object({
  communityId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  options: z.array(z.object({ id: z.string().optional(), label: z.string().optional() })).optional(),
  durationHours: z.number().optional(),
});

const voteSchema = z.object({
  voteId: z.string().min(1),
  choice: z.union([z.string().min(1), z.array(z.string()).min(1)]),
  weight: z.number().min(1).optional(),
});

const meetingStatusSchema = z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']);

const meetingSchema = z.object({
  meetingId: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  agenda: z.string().max(5000).optional(),
  location: z.string().max(500).optional(),
  attendees: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        label: z.string().max(120).optional(),
      }),
    )
    .max(500)
    .default([]),
  relatedProposalId: z.string().max(200).optional(),
  status: meetingStatusSchema.default('scheduled'),
});

const treasurySnapshotSchema = z.object({
  snapshotId: z.string().min(1).max(120),
  generatedAt: z.string().min(1),
  lines: z
    .array(
      z.object({
        asset: z.string().min(1).max(40),
        balance: z.string().min(1).max(80),
        delta24h: z.string().max(80).optional(),
      }),
    )
    .min(1),
  totalReference: z
    .object({ currency: z.string().min(1).max(20), amount: z.string().min(1).max(80) })
    .optional(),
});

function idempotencyKey(voteId: string, userId: string): string {
  return `${voteId}::${userId}`;
}

function createGovernanceRouter() {
  const governance = new Hono();

  governance.post('/proposals', async (c) => {
    const denied = requireDomainCapability(c, 'governance', 'write');
    if (denied) return denied;
    const proposerId = getAuthenticatedUserId(c);
    if (!proposerId) {
      return c.json({ code: 'unauthorized', message: 'Sign in required' }, 401);
    }

    const parsed = await readJsonBody(c, proposalSchema);
    if (parsed instanceof Response) return parsed;
    const { communityId, title, description } = parsed;
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
    const userId = getAuthenticatedUserId(c);
    if (!userId) {
      return c.json({ code: 'unauthorized', message: 'Sign in required' }, 401);
    }

    const parsed = await readJsonBody(c, voteSchema);
    if (parsed instanceof Response) return parsed;
    const { voteId, choice } = parsed;
    const weight = parsed.weight ?? 1;
    const normalizedChoice = Array.isArray(choice) ? choice[0] : choice;

    const vote = db.getVote(voteId);
    if (!vote) {
      return c.json({ code: 'vote_not_found', message: 'Vote not found' }, 404);
    }

    if (vote.status !== 'active') {
      return c.json({ code: 'vote_closed', message: 'This vote is no longer active' }, 409);
    }

    if (vote.endsAt && new Date(vote.endsAt) < new Date()) {
      return c.json({ code: 'vote_expired', message: 'Voting period has ended' }, 409);
    }

    try {
      db.castVote({ id: crypto.randomUUID(), voteId, userId, choice: normalizedChoice, weight });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'You have already voted') {
        return c.json({ code: 'invalid_request', message: 'You have already submitted a vote' }, 409);
      }
      return c.json({ code: 'invalid_request', message: 'Unable to process vote' }, 400);
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

  governance.get('/proposals/:proposalId/audit', async (c) => {
    const denied = requireDomainCapability(c, 'governance', 'read');
    if (denied) return denied;
    const { proposalId } = c.req.param();
    const vote = db.getVote(proposalId);
    if (!vote) return c.json({ code: 'proposal_not_found', message: 'Proposal not found' }, 404);
    const entries = db.getVoteEntriesOrdered(proposalId);
    const chain = await verifyAuditChain(entries);
    return c.json({ proposalId, entries, chain });
  });

  governance.get('/events', (c) => {
    const denied = requireDomainCapability(c, 'governance', 'read');
    if (denied) return denied;

    return c.json(listDomainEvents('governance'));
  });

  governance.get('/meetings', (c) => {
    const denied = requireDomainCapability(c, 'governance', 'read');
    if (denied) return denied;
    const proposalId = c.req.query('proposalId') ?? undefined;
    return c.json({ items: listMeetings({ proposalId }) });
  });

  governance.put('/meetings/:meetingId', async (c) => {
    const denied = requireDomainCapability(c, 'governance', 'write');
    if (denied) return denied;
    const parsed = await readJsonBody(c, meetingSchema);
    if (parsed instanceof Response) return parsed;
    const { meetingId } = c.req.param();
    if (parsed.meetingId !== meetingId) {
      return c.json(
        { code: 'invalid_request', message: 'Body meetingId must match URL meetingId' },
        400,
      );
    }
    try {
      const meeting = upsertMeeting(parsed);
      const event = emitDomainEvent({
        module: 'governance',
        type: 'governance.meeting.scheduled',
        payload: meeting,
      });
      return c.json({ ...meeting, event });
    } catch (error) {
      return c.json({ code: 'invalid_request', message: 'Unable to process request' }, 400);
    }
  });

  governance.delete('/meetings/:meetingId', (c) => {
    const denied = requireDomainCapability(c, 'governance', 'write');
    if (denied) return denied;
    const { meetingId } = c.req.param();
    const cancelled = cancelMeeting(meetingId);
    if (!cancelled) {
      return c.json({ code: 'meeting_not_found', message: 'Meeting not found' }, 404);
    }
    const event = emitDomainEvent({
      module: 'governance',
      type: 'governance.meeting.scheduled',
      payload: cancelled,
    });
    return c.json({ ...cancelled, event });
  });

  governance.post('/treasury/snapshot', async (c) => {
    const denied = requireDomainCapability(c, 'governance', 'write');
    if (denied) return denied;
    const parsed = await readJsonBody(c, treasurySnapshotSchema);
    if (parsed instanceof Response) return parsed;
    const snapshot = publishTreasurySnapshot(parsed);
    const event = emitDomainEvent({
      module: 'governance',
      type: 'governance.treasury.snapshot.published',
      payload: snapshot,
    });
    return c.json({ ...snapshot, event }, 201);
  });

  governance.get('/treasury/snapshot', (c) => {
    const denied = requireDomainCapability(c, 'governance', 'read');
    if (denied) return denied;
    const snapshot = getLatestTreasurySnapshot();
    if (!snapshot) {
      return c.json({ code: 'snapshot_not_found', message: 'No treasury snapshot yet' }, 404);
    }
    return c.json(snapshot);
  });

  governance.get('/treasury/snapshots', (c) => {
    const denied = requireDomainCapability(c, 'governance', 'read');
    if (denied) return denied;
    const cursor = c.req.query('cursor') ?? undefined;
    const limitRaw = c.req.query('limit');
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    const result = listTreasurySnapshots({
      cursor,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return c.json(result);
  });

  return governance;
}

export const governanceModule: FeatureModule = {
  id: 'governance',
  mountPath: '/governance',
  registerRoutes: createGovernanceRouter,
};
