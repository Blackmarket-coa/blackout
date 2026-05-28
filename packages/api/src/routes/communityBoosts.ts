import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin } from '../middleware/require-admin';
import { requireUser } from '../middleware/require-user';
import { readJsonBody } from '../middleware/validate';
import {
    cancelBoostPledge,
    captureBoostPledge,
    CommunityBoostError,
    COMMUNITY_BOOST_LIMITS,
    getCommunityBoostState,
    getPledge,
    listPledgesForCommunity,
    listPledgesForUser,
    pledgeBoost,
    refundBoostPledge,
} from '../services/communityBoosts';

const boosts = new Hono();

const pledgeSchema = z.object({
    communityId: z.string().min(1),
    monthlyCents: z
        .number()
        .int()
        .min(COMMUNITY_BOOST_LIMITS.minPledgeCents)
        .max(COMMUNITY_BOOST_LIMITS.maxPledgeCents),
    currency: z.string().min(3).max(8),
});

const captureSchema = z
    .object({
        fbmSubscriptionId: z.string().min(1).max(255).optional(),
        periodDays: z.number().int().min(1).max(365).optional(),
        effectiveAt: z.string().datetime().optional(),
    })
    .optional();

const ERROR_STATUS: Record<CommunityBoostError['code'], number> = {
    amount_out_of_range: 400,
    invalid_currency: 400,
    community_unknown: 404,
    pledger_unknown: 404,
    already_pledged: 409,
    pledge_not_found: 404,
    forbidden: 403,
};

// Admin gate is provided by the shared middleware (packages/api/src/middleware/require-admin.ts).

boosts.post('/pledge', async (c) => {
    const user = requireUser(c, 'Sign in to pledge a boost');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, pledgeSchema);
    if (parsed instanceof Response) return parsed;
    try {
        const pledge = pledgeBoost({
            communityId: parsed.communityId,
            pledgerUserId: user.sub,
            monthlyCents: parsed.monthlyCents,
            currency: parsed.currency,
        });
        return c.json({ pledge }, 201);
    } catch (error) {
        if (error instanceof CommunityBoostError) {
            return c.json(
                { code: error.code, message: error.message },
                ERROR_STATUS[error.code] as 400 | 403 | 404 | 409
            );
        }
        throw error;
    }
});

boosts.get('/communities/:communityId', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const communityId = c.req.param('communityId');
    const state = getCommunityBoostState(communityId);
    return c.json({
        ...state,
        pledges: listPledgesForCommunity(communityId),
    });
});

boosts.get('/communities/:communityId/state', (c) => {
    return c.json(getCommunityBoostState(c.req.param('communityId')));
});

boosts.get('/me', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    return c.json({ pledges: listPledgesForUser(user.sub) });
});

boosts.get('/pledges/:id', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const pledge = getPledge(c.req.param('id'));
    if (!pledge) return c.json({ code: 'pledge_not_found', message: 'No such pledge' }, 404);
    if (pledge.pledgerUserId !== user.sub) {
        // Other community members can also see the pledge exists (basic info only).
        return c.json({ pledge: { ...pledge, fbmSubscriptionId: null } });
    }
    return c.json({ pledge });
});

boosts.post('/pledges/:id/cancel', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    try {
        const pledge = cancelBoostPledge(c.req.param('id'), user.sub);
        if (!pledge) return c.json({ code: 'pledge_not_found', message: 'No such pledge' }, 404);
        return c.json({ pledge });
    } catch (error) {
        if (error instanceof CommunityBoostError) {
            return c.json(
                { code: error.code, message: error.message },
                ERROR_STATUS[error.code] as 400 | 403 | 404 | 409
            );
        }
        throw error;
    }
});

boosts.post('/pledges/:id/capture', async (c) => {
    const guard = requireAdmin(c);
    if (guard !== true) return guard;
    const parsed = await readJsonBody(c, captureSchema);
    const detail = parsed instanceof Response ? {} : (parsed ?? {});
    const pledge = captureBoostPledge(c.req.param('id'), detail);
    if (!pledge) return c.json({ code: 'pledge_not_found', message: 'No such pledge' }, 404);
    return c.json({ pledge });
});

boosts.post('/pledges/:id/refund', (c) => {
    const guard = requireAdmin(c);
    if (guard !== true) return guard;
    const pledge = refundBoostPledge(c.req.param('id'));
    if (!pledge) return c.json({ code: 'pledge_not_found', message: 'No such pledge' }, 404);
    return c.json({ pledge });
});

export default boosts;
