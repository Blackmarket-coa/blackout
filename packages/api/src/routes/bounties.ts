import { Hono } from 'hono';
import { z } from 'zod';
import {
    BOUNTY_CATEGORIES,
    BOUNTY_REWARD_TYPES,
    BOUNTY_STATUSES,
    recommendBounties,
} from '@blackout/core';
import {
    acceptBountyApplication,
    applyToBounty,
    claimBounty,
    createBounty,
    getBounty,
    listBounties,
    listBountyApplications,
    newBountyApplicationId,
    newBountyId,
    updateBountyStatus,
} from '../services/bountyStore';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';

const bounties = new Hono();

const listQuerySchema = z.object({
    category: z.enum(BOUNTY_CATEGORIES).optional(),
    status: z.enum(BOUNTY_STATUSES).optional(),
    coalitionId: z.string().optional(),
});

bounties.get('/', (c) => {
    const parsed = listQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
        return c.json({ code: 'invalid_request', message: 'Invalid bounty query' }, 400);
    }
    return c.json({ bounties: listBounties(parsed.data) });
});

// Auto-matching: open bounties recommended to the signed-in creator. Declared
// before the `/:id/...` routes so the static path is matched first.
bounties.get('/recommended', (c) => {
    const user = requireUser(c, 'Sign in to see recommended bounties');
    if (user instanceof Response) return user;
    const open = listBounties({ status: 'open' });
    const appliedBountyIds = listBountyApplications({ applicantId: user.sub }).map(
        (app) => app.bountyId,
    );
    const recommended = recommendBounties({ open, viewerId: user.sub, appliedBountyIds });
    return c.json({ bounties: recommended });
});

const createBountySchema = z.object({
    category: z.enum(BOUNTY_CATEGORIES),
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(4000),
    rewardType: z.enum(BOUNTY_REWARD_TYPES),
    rewardSummary: z.string().min(1).max(200),
    rewardAmountCents: z.number().int().nonnegative().optional(),
    requirements: z.array(z.string().max(500)).max(20).optional(),
    deliverables: z.array(z.string().max(500)).max(20).optional(),
    coalitionId: z.string().optional(),
});

bounties.post('/', async (c) => {
    const user = requireUser(c, 'Sign in to post a bounty');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, createBountySchema);
    if (parsed instanceof Response) return parsed;
    const bounty = createBounty({
        id: newBountyId(),
        creatorId: user.sub,
        category: parsed.category,
        title: parsed.title,
        description: parsed.description,
        rewardType: parsed.rewardType,
        rewardSummary: parsed.rewardSummary,
        rewardAmountCents: parsed.rewardAmountCents,
        requirements: parsed.requirements,
        deliverables: parsed.deliverables,
        coalitionId: parsed.coalitionId,
    });
    return c.json({ bounty }, 201);
});

bounties.post('/:id/claim', (c) => {
    const user = requireUser(c, 'Sign in to claim a bounty');
    if (user instanceof Response) return user;
    const bounty = claimBounty(c.req.param('id'), user.sub);
    if (!bounty) {
        return c.json(
            { code: 'not_found', message: 'Bounty not found or no longer open' },
            404,
        );
    }
    return c.json({ bounty });
});

// --- applications (producer ↔ creator matching) ---

const applySchema = z.object({
    message: z.string().max(1000).optional(),
});

bounties.post('/:id/applications', async (c) => {
    const user = requireUser(c, 'Sign in to apply to a bounty');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, applySchema);
    if (parsed instanceof Response) return parsed;
    const result = applyToBounty({
        id: newBountyApplicationId(),
        bountyId: c.req.param('id'),
        applicantId: user.sub,
        message: parsed.message,
    });
    if (result === 'not_open') {
        return c.json(
            { code: 'not_found', message: 'Bounty not found or no longer open' },
            404,
        );
    }
    if (result === 'duplicate') {
        return c.json(
            { code: 'conflict', message: 'You already have a pending application' },
            409,
        );
    }
    return c.json({ application: result }, 201);
});

bounties.get('/:id/applications', (c) => {
    const user = requireUser(c, 'Sign in to view applicants');
    if (user instanceof Response) return user;
    const bounty = getBounty(c.req.param('id'));
    if (!bounty) {
        return c.json({ code: 'not_found', message: 'Bounty not found' }, 404);
    }
    if (bounty.creatorId !== user.sub) {
        return c.json(
            { code: 'forbidden', message: 'Only the poster can view applicants' },
            403,
        );
    }
    return c.json({ applications: listBountyApplications({ bountyId: bounty.id }) });
});

bounties.post('/:id/applications/:applicantId/accept', (c) => {
    const user = requireUser(c, 'Sign in to accept an applicant');
    if (user instanceof Response) return user;
    const bounty = getBounty(c.req.param('id'));
    if (!bounty) {
        return c.json({ code: 'not_found', message: 'Bounty not found' }, 404);
    }
    if (bounty.creatorId !== user.sub) {
        return c.json(
            { code: 'forbidden', message: 'Only the poster can accept an applicant' },
            403,
        );
    }
    const result = acceptBountyApplication(bounty.id, c.req.param('applicantId'));
    if (!result) {
        return c.json(
            { code: 'not_found', message: 'No pending application from that applicant' },
            404,
        );
    }
    return c.json(result);
});

const updateStatusSchema = z.object({
    status: z.enum(BOUNTY_STATUSES),
});

bounties.patch('/:id', async (c) => {
    const user = requireUser(c, 'Sign in to update a bounty');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, updateStatusSchema);
    if (parsed instanceof Response) return parsed;
    const bounty = updateBountyStatus(c.req.param('id'), parsed.status);
    if (!bounty) {
        return c.json({ code: 'not_found', message: 'Bounty not found' }, 404);
    }
    return c.json({ bounty });
});

export default bounties;
