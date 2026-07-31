import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { requireUser } from '../middleware/require-user';
import { readJsonBody } from '../middleware/validate';
import {
    applyManualComp,
    applySubscriptionWebhookEvent,
    claimGift,
    createCheckoutSession,
    createCustomerPortalSession,
    donateForward,
    forwardGift,
    getMyGifts,
    getSubscription,
    applyStripeCheckoutCompleted,
    getSubscriptionAuditTimeline,
    listAvailableGifts,
    listCanopyProducts,
    syncRefund,
    type StripeCheckoutCompletedEvent,
    type SubscriptionWebhookEvent,
} from '../services/subscriptions';
import { verifyBillingWebhook, verifyStripeWebhook } from '../services/billingWebhookSignature';
import { log } from '../telemetry/logger';

const subscriptions = new Hono();

const checkoutSchema = z.object({
    planCode: z.string().min(1),
    successUrl: z.string().optional(),
    cancelUrl: z.string().optional(),
});

const portalSchema = z.object({ returnUrl: z.string().optional() });

const webhookEventTypes = [
    'invoice.paid',
    'invoice.payment_failed',
    'subscription.renewed',
    'subscription.canceled',
    'charge.refunded',
    'charge.dispute.created',
] as const;

const webhookSchema = z
    .object({
        eventId: z.string().min(1),
        type: z.enum(webhookEventTypes),
        userId: z.string().min(1),
    })
    .loose();

// Stripe event envelope for the checkout webhook. We only act on
// `checkout.session.completed`, reading `client_reference_id` (the Blackout user
// id set at checkout) and `customer` (the real `cus_…`).
const stripeWebhookSchema = z
    .object({
        id: z.string().min(1),
        type: z.string().min(1),
        data: z
            .object({
                object: z
                    .object({
                        client_reference_id: z.string().nullish(),
                        customer: z.string().nullish(),
                    })
                    .loose(),
            })
            .loose(),
    })
    .loose();

const adminUserSchema = z.object({
    userId: z.string().min(1),
    detail: z.string().optional(),
    reason: z.string().optional(),
    actor: z.string().optional(),
});

function requireAdmin(c: Context): true | Response {
    const expected = process.env.BLACKOUT_ADMIN_API_KEY ?? 'dev-admin-key';
    const got = c.req.header('x-admin-api-key');
    if (!got || got !== expected) {
        return c.json({ code: 'forbidden', message: 'Admin API key required' }, 403);
    }
    return true;
}

subscriptions.get('/plans', (c) => {
    return c.json({ products: listCanopyProducts() });
});

subscriptions.get('/me', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    return c.json({ subscription: getSubscription(user.sub) });
});

subscriptions.post('/checkout', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, checkoutSchema);
    if (parsed instanceof Response) return parsed;

    try {
        const session = await createCheckoutSession({
            userId: user.sub,
            planCode: parsed.planCode,
            successUrl: parsed.successUrl,
            cancelUrl: parsed.cancelUrl,
            provider: 'stripe',
        });
        return c.json(session, 201);
    } catch {
        return c.json({ code: 'invalid_plan', message: 'Unknown planCode' }, 400);
    }
});

subscriptions.post('/portal', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, portalSchema);
    const returnUrl = parsed instanceof Response ? undefined : parsed.returnUrl;
    return c.json(await createCustomerPortalSession(user.sub, returnUrl));
});

subscriptions.post('/webhooks/lago', async (c) => {
    // Read the raw body so HMAC verification is byte-exact. Re-parsing JSON
    // afterwards is safe — we already require valid JSON via the Zod schema.
    const rawBody = await c.req.text();
    const headers: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(c.req.header())) {
        headers[key.toLowerCase()] = value;
    }
    const verification = verifyBillingWebhook(rawBody, headers);
    if (!verification.ok) {
        log.warn('billing_webhook_rejected', {
            provider: verification.provider,
            reason: verification.reason,
        });
        return c.json(
            {
                code: 'webhook_unauthorized',
                message: 'Webhook signature verification failed',
                reason: verification.reason,
            },
            401
        );
    }

    let payload: unknown;
    try {
        payload = JSON.parse(rawBody);
    } catch {
        return c.json({ code: 'invalid_json', message: 'Webhook payload is not valid JSON' }, 400);
    }
    const parsed = webhookSchema.safeParse(payload);
    if (!parsed.success) {
        return c.json(
            {
                code: 'invalid_payload',
                message: 'Webhook payload failed validation',
                issues: parsed.error.issues,
            },
            400
        );
    }

    const result = applySubscriptionWebhookEvent(parsed.data as SubscriptionWebhookEvent);
    return c.json({
        ok: true,
        processed: result.processed,
        status: result.status,
        userId: result.userId,
    });
});

// Stripe checkout webhook: on `checkout.session.completed`, sync the real
// `cus_…` onto the subscription record so the Billing Portal can leave the mock
// path. Signature is verified byte-exact against STRIPE_WEBHOOK_SECRET.
subscriptions.post('/webhooks/stripe', async (c) => {
    const rawBody = await c.req.text();
    const headers: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(c.req.header())) {
        headers[key.toLowerCase()] = value;
    }
    const verification = verifyStripeWebhook(rawBody, headers);
    if (!verification.ok) {
        log.warn('stripe_webhook_rejected', { reason: verification.reason });
        return c.json(
            {
                code: 'webhook_unauthorized',
                message: 'Stripe signature verification failed',
                reason: verification.reason,
            },
            401
        );
    }

    let payload: unknown;
    try {
        payload = JSON.parse(rawBody);
    } catch {
        return c.json({ code: 'invalid_json', message: 'Webhook payload is not valid JSON' }, 400);
    }
    const parsed = stripeWebhookSchema.safeParse(payload);
    if (!parsed.success) {
        return c.json(
            {
                code: 'invalid_payload',
                message: 'Webhook payload failed validation',
                issues: parsed.error.issues,
            },
            400
        );
    }

    const result = applyStripeCheckoutCompleted(parsed.data as StripeCheckoutCompletedEvent);
    return c.json({
        ok: true,
        processed: result.processed,
        reason: result.reason,
        userId: result.userId,
    });
});

subscriptions.post('/admin/comp', async (c) => {
    const admin = requireAdmin(c);
    if (admin instanceof Response) return admin;
    const parsed = await readJsonBody(c, adminUserSchema);
    if (parsed instanceof Response) return parsed;
    const subscription = applyManualComp(parsed.userId, parsed.actor ?? 'admin', parsed.detail);
    return c.json({ ok: true, subscription });
});

subscriptions.post('/admin/refund-sync', async (c) => {
    const admin = requireAdmin(c);
    if (admin instanceof Response) return admin;
    const parsed = await readJsonBody(c, adminUserSchema);
    if (parsed instanceof Response) return parsed;
    const subscription = syncRefund(parsed.userId, parsed.actor ?? 'admin', parsed.reason);
    return c.json({ ok: true, subscription });
});

subscriptions.get('/admin/audit/:userId', (c) => {
    const admin = requireAdmin(c);
    if (admin instanceof Response) return admin;
    const userId = c.req.param('userId');
    return c.json({
        userId,
        timeline: getSubscriptionAuditTimeline(userId),
        subscription: getSubscription(userId),
    });
});

const forwardSchema = z
    .object({
        expiresInDays: z.number().int().positive().max(365).optional(),
    })
    .loose();

const giftErrorMap: Record<
    string,
    { code: string; status: 400 | 404 | 409 | 410; message: string }
> = {
    no_active_subscription: {
        code: 'no_active_subscription',
        status: 409,
        message: 'An active paid subscription is required to pay it forward.',
    },
    free_tier_cannot_donate: {
        code: 'free_tier_cannot_donate',
        status: 409,
        message: 'Free-tier users cannot donate a subscription forward.',
    },
    gift_not_found: { code: 'gift_not_found', status: 404, message: 'Gift does not exist.' },
    gift_unavailable: {
        code: 'gift_unavailable',
        status: 409,
        message: 'Gift has already been claimed or forwarded.',
    },
    gift_expired: { code: 'gift_expired', status: 410, message: 'Gift has expired.' },
    cannot_claim_own_gift: {
        code: 'cannot_claim_own_gift',
        status: 409,
        message: 'You cannot claim a gift you donated.',
    },
    cannot_forward_own_gift: {
        code: 'cannot_forward_own_gift',
        status: 409,
        message: 'You cannot forward a gift you donated.',
    },
};

function giftError(c: Context, err: unknown): Response {
    const message = err instanceof Error ? err.message : String(err);
    const mapped = giftErrorMap[message];
    if (mapped) return c.json({ code: mapped.code, message: mapped.message }, mapped.status);
    return c.json({ code: 'gift_error', message: 'Unable to process gift.' }, 400);
}

subscriptions.post('/forward', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const parsed = await readJsonBody(c, forwardSchema);
    const opts = parsed instanceof Response ? {} : parsed;

    try {
        const gift = donateForward(user.sub, user.sub, { expiresInDays: opts.expiresInDays });
        return c.json({ ok: true, gift }, 201);
    } catch (err) {
        return giftError(c, err);
    }
});

subscriptions.get('/forward/available', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const limitParam = c.req.query('limit');
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    const gifts = listAvailableGifts({ limit: Number.isFinite(limit) ? limit : undefined }).filter(
        (gift) => gift.donorUserId !== user.sub
    );
    return c.json({ gifts });
});

subscriptions.get('/forward/me', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    return c.json(getMyGifts(user.sub));
});

subscriptions.post('/forward/:giftId/claim', (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const giftId = c.req.param('giftId');
    try {
        const result = claimGift(giftId, user.sub, user.sub);
        return c.json({ ok: true, ...result });
    } catch (err) {
        return giftError(c, err);
    }
});

subscriptions.post('/forward/:giftId/pass', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    const giftId = c.req.param('giftId');
    const parsed = await readJsonBody(c, forwardSchema);
    const opts = parsed instanceof Response ? {} : parsed;
    try {
        const result = forwardGift(giftId, user.sub, user.sub, {
            expiresInDays: opts.expiresInDays,
        });
        return c.json({ ok: true, ...result }, 201);
    } catch (err) {
        return giftError(c, err);
    }
});

export default subscriptions;
