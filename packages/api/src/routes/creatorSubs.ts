import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin } from '../middleware/require-admin';
import { requireUser } from '../middleware/require-user';
import { readJsonBody } from '../middleware/validate';
import {
    archiveTier,
    cancelSubscription,
    captureSubscription,
    createTier,
    CreatorSubscriptionError,
    CREATOR_SUB_LIMITS,
    getSubscription,
    getTier,
    listSubscribersForCreator,
    listSubscriptionsForSubscriber,
    listTiersForCreator,
    refundSubscription,
    startSubscription,
} from '../services/creatorSubscriptions';

const creatorSubs = new Hono();

const tierSchema = z.object({
    name: z.string().min(1).max(64),
    description: z.string().max(2000).optional(),
    priceCents: z
        .number()
        .int()
        .min(CREATOR_SUB_LIMITS.minTierPriceCents)
        .max(CREATOR_SUB_LIMITS.maxTierPriceCents),
    currency: z.string().min(3).max(8),
});

const subscribeSchema = z.object({
    tierId: z.string().min(1),
});

const captureSchema = z
    .object({
        fbmSubscriptionId: z.string().min(1).max(255).optional(),
        periodDays: z.number().int().min(1).max(365).optional(),
        effectiveAt: z.string().datetime().optional(),
    })
    .optional();

const ERROR_STATUS: Record<CreatorSubscriptionError['code'], number> = {
    self_subscribe_forbidden: 400,
    creator_unknown: 404,
    tier_not_found: 404,
    tier_archived: 410,
    tier_price_out_of_range: 400,
    invalid_currency: 400,
    tier_name_required: 400,
    already_active: 409,
    subscription_not_found: 404,
    provider_unsupported: 400,
};

// Admin gate is provided by the shared middleware (packages/api/src/middleware/require-admin.ts).

// Tier management — creator manages their own catalog of subscription tiers.

creatorSubs.get('/me/tiers', (c) => {
    const user = requireUser(c, 'Sign in to view your tiers');
    if (user instanceof Response) return user;
    return c.json({ tiers: listTiersForCreator(user.sub) });
});

creatorSubs.post('/me/tiers', async (c) => {
    const user = requireUser(c, 'Sign in to create a tier');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, tierSchema);
    if (parsed instanceof Response) return parsed;
    try {
        const tier = await createTier({
            creatorUserId: user.sub,
            name: parsed.name,
            description: parsed.description,
            priceCents: parsed.priceCents,
            currency: parsed.currency,
        });
        return c.json({ tier }, 201);
    } catch (error) {
        if (error instanceof CreatorSubscriptionError) {
            return c.json(
                { code: error.code, message: error.message },
                ERROR_STATUS[error.code] as 400 | 404 | 409 | 410
            );
        }
        throw error;
    }
});

creatorSubs.delete('/me/tiers/:tierId', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const tier = archiveTier(c.req.param('tierId'), user.sub);
    if (!tier) return c.json({ code: 'tier_not_found', message: 'No such tier' }, 404);
    return c.json({ tier });
});

creatorSubs.get('/creators/:creatorUserId/tiers', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const tiers = listTiersForCreator(c.req.param('creatorUserId')).filter(
        (t) => t.status === 'active'
    );
    return c.json({ tiers });
});

// Subscriber-facing endpoints.

creatorSubs.post('/subscribe', async (c) => {
    const user = requireUser(c, 'Sign in to subscribe to a creator');
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, subscribeSchema);
    if (parsed instanceof Response) return parsed;
    try {
        const subscription = startSubscription({
            subscriberUserId: user.sub,
            tierId: parsed.tierId,
        });
        return c.json({ subscription }, 201);
    } catch (error) {
        if (error instanceof CreatorSubscriptionError) {
            return c.json(
                { code: error.code, message: error.message },
                ERROR_STATUS[error.code] as 400 | 404 | 409 | 410
            );
        }
        throw error;
    }
});

creatorSubs.get('/subscriptions/me', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    return c.json({ subscriptions: listSubscriptionsForSubscriber(user.sub) });
});

creatorSubs.get('/me/subscribers', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    return c.json({ subscriptions: listSubscribersForCreator(user.sub) });
});

creatorSubs.get('/subscriptions/:id', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const sub = getSubscription(c.req.param('id'));
    if (!sub) return c.json({ code: 'subscription_not_found', message: 'No such subscription' }, 404);
    if (sub.subscriberUserId !== user.sub && sub.creatorUserId !== user.sub) {
        return c.json({ code: 'subscription_not_found', message: 'No such subscription' }, 404);
    }
    return c.json({ subscription: sub });
});

creatorSubs.post('/subscriptions/:id/cancel', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const sub = cancelSubscription(c.req.param('id'), user.sub);
    if (!sub) return c.json({ code: 'subscription_not_found', message: 'No such subscription' }, 404);
    return c.json({ subscription: sub });
});

// Admin/webhook hooks (FBM dispatcher in production).

creatorSubs.post('/subscriptions/:id/capture', async (c) => {
    const guard = requireAdmin(c);
    if (guard !== true) return guard;
    const parsed = await readJsonBody(c, captureSchema);
    const detail = parsed instanceof Response ? {} : (parsed ?? {});
    const sub = captureSubscription(c.req.param('id'), detail);
    if (!sub) return c.json({ code: 'subscription_not_found', message: 'No such subscription' }, 404);
    return c.json({ subscription: sub });
});

creatorSubs.post('/subscriptions/:id/refund', (c) => {
    const guard = requireAdmin(c);
    if (guard !== true) return guard;
    const sub = refundSubscription(c.req.param('id'));
    if (!sub) return c.json({ code: 'subscription_not_found', message: 'No such subscription' }, 404);
    return c.json({ subscription: sub });
});

// Public helper exposed for tooling (e.g. integration tests inspecting tier).
creatorSubs.get('/tiers/:id', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const tier = getTier(c.req.param('id'));
    if (!tier) return c.json({ code: 'tier_not_found', message: 'No such tier' }, 404);
    return c.json({ tier });
});

export default creatorSubs;
