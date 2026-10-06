import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { isOriginAllowed, readCorsRuntimeConfig } from '../config/cors';
import { requireUser } from '../middleware/require-user';
import { readJsonBody } from '../middleware/validate';
import {
    applyManualComp,
    CanopyBillingError,
    claimGift,
    createCheckoutSession,
    createSubscriptionManageSession,
    acceptManageReturnUrl,
    donateForward,
    forwardGift,
    getMyGifts,
    getSubscription,
    getSubscriptionAuditTimeline,
    listAvailableGifts,
    isManageSessionEnabled,
    listCanopyProducts,
    ManageSessionError,
    syncRefund,
} from '../services/subscriptions';
import { log } from '../telemetry/logger';

// W1b: the direct Stripe/Lago rail is retired. Money moves on FBM — checkout
// below delegates to the marketplace provider, and the settled purchase loops
// back through the FBM marketplace webhook (`metadata.canopyPlanCode` →
// `applySubscriptionWebhookEvent`). The former `/portal`, `/webhooks/lago`
// and `/webhooks/stripe` endpoints are gone with it; plan/state changes are
// managed locally + via FBM, and `getSubscriptionAuditTimeline` keeps the
// ops-facing trail. There is still no Blackout-hosted billing portal:
// `/manage-session` below only mints a short-lived link to FBM's own hosted
// manage page, where renewal and cancellation happen. See
// docs/contracts/fbm-billing-consumer.md.

const subscriptions = new Hono();

const checkoutSchema = z.object({
    planCode: z.string().min(1),
    successUrl: z.string().optional(),
    cancelUrl: z.string().optional(),
    embed: z.boolean().optional(),
});

const manageSessionSchema = z.object({
    returnUrl: z.string().max(2048).optional(),
});

function returnOriginAllowed(origin: string): boolean {
    try {
        const config = readCorsRuntimeConfig();
        // A wildcard CORS config (allowed outside production) is not an
        // allowlist, so it forwards no return origin at all rather than all
        // of them.
        if (config.allowAny) return false;
        return isOriginAllowed(origin, config);
    } catch {
        // An unreadable CORS config allows nothing.
        return false;
    }
}

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
        const originHeader = c.req.header('origin');
        const session = await createCheckoutSession({
            userId: user.sub,
            planCode: parsed.planCode,
            successUrl: parsed.successUrl,
            cancelUrl: parsed.cancelUrl,
            embed: parsed.embed,
            embedOrigin: originHeader?.startsWith('https://') ? originHeader : undefined,
        });
        return c.json(session, 201);
    } catch (error) {
        if (error instanceof CanopyBillingError) {
            if (error.code === 'unknown_plan') {
                return c.json({ code: 'invalid_plan', message: 'Unknown planCode' }, 400);
            }
            return c.json(
                {
                    code: 'billing_unavailable',
                    message: 'Canopy billing is not available in this environment yet',
                },
                503
            );
        }
        log.warn('canopy_checkout_failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        return c.json({ code: 'checkout_failed', message: 'Checkout could not be started' }, 502);
    }
});

// Mint a link to FBM's hosted subscription management page (manage-session
// contract, 2026-10-06). The member turns off automatic renewal or cancels
// there; the result reaches Blackout through FBM's existing webhooks, not
// through this route. The response body is a bearer capability for the
// member's billing: it is never logged or audited, and it is marked
// uncacheable.
subscriptions.post('/manage-session', async (c) => {
    const user = requireUser(c);
    if (user instanceof Response) return user;
    if (!isManageSessionEnabled()) {
        return c.json(
            {
                code: 'billing_unavailable',
                message: 'Billing management is not available in this environment yet',
            },
            503
        );
    }
    const parsed = await readJsonBody(c, manageSessionSchema);
    if (parsed instanceof Response) return parsed;

    try {
        const session = await createSubscriptionManageSession({
            // From the verified token only. A `userId` in the body is not
            // part of the schema and is stripped by the parse above.
            userId: user.sub,
            returnUrl: acceptManageReturnUrl(parsed.returnUrl, returnOriginAllowed),
        });
        c.header('cache-control', 'no-store');
        return c.json({ url: session.url, expiresAt: session.expiresAt }, 201);
    } catch (error) {
        const code = error instanceof ManageSessionError ? error.code : 'manage_session_failed';
        // Code only: never the URL, and not the provider's error text.
        log.warn('subscription_manage_session_failed', { code });
        if (code === 'billing_unavailable') {
            return c.json(
                {
                    code: 'billing_unavailable',
                    message: 'Billing management is not available in this environment yet',
                },
                503
            );
        }
        if (code === 'identity_ambiguous') {
            return c.json(
                {
                    code: 'billing_identity_ambiguous',
                    message:
                        'More than one Free Black Market billing account matches this account. Contact support.',
                },
                409
            );
        }
        return c.json(
            {
                code: 'manage_session_failed',
                message: 'Free Black Market did not return a management link',
            },
            502
        );
    }
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
