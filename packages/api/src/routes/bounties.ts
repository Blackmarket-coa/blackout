import { Hono } from 'hono';
import { z } from 'zod';
import { BOUNTY_CATEGORIES, BOUNTY_REWARD_TYPES, BOUNTY_STATUSES } from '@blackout/core';
import {
    claimBounty,
    createBounty,
    listBounties,
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
