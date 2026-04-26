import { Hono } from 'hono';
import type { Context } from 'hono';
import { requireUser } from '../middleware/require-user';
import {
  applyManualComp,
  applySubscriptionWebhookEvent,
  createCheckoutSession,
  createCustomerPortalSession,
  getSubscription,
  getSubscriptionAuditTimeline,
  listCanopyProducts,
  syncRefund,
  type SubscriptionWebhookEvent,
} from '../services/subscriptions';

const subscriptions = new Hono();

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
  const body = await c.req.json<{ planCode?: string; successUrl?: string; cancelUrl?: string }>();

  if (!body.planCode) {
    return c.json({ code: 'invalid_plan', message: 'planCode is required' }, 400);
  }

  try {
    const session = createCheckoutSession({
      userId: user.sub,
      planCode: body.planCode,
      successUrl: body.successUrl,
      cancelUrl: body.cancelUrl,
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
  const body = await c.req.json<{ returnUrl?: string }>().catch(() => ({}));
  return c.json(createCustomerPortalSession(user.sub, body.returnUrl));
});

subscriptions.post('/webhooks/lago', async (c) => {
  const rawBody = await c.req.json<Partial<SubscriptionWebhookEvent>>();
  if (!rawBody?.eventId || !rawBody?.type || !rawBody?.userId) {
    return c.json({ code: 'invalid_webhook', message: 'eventId, type, and userId are required' }, 400);
  }

  const allowedTypes = new Set([
    'invoice.paid',
    'invoice.payment_failed',
    'subscription.renewed',
    'subscription.canceled',
    'charge.refunded',
    'charge.dispute.created',
  ]);
  if (!allowedTypes.has(rawBody.type)) {
    return c.json({ code: 'unsupported_event', message: 'Unsupported webhook type' }, 400);
  }

  const result = applySubscriptionWebhookEvent(rawBody as SubscriptionWebhookEvent);
  return c.json({ ok: true, processed: result.processed, status: result.status, userId: result.userId });
});

subscriptions.post('/admin/comp', async (c) => {
  const admin = requireAdmin(c);
  if (admin instanceof Response) return admin;
  const body = await c.req.json<{ userId?: string; detail?: string; actor?: string }>();
  if (!body.userId) return c.json({ code: 'invalid_request', message: 'userId is required' }, 400);
  const subscription = applyManualComp(body.userId, body.actor ?? 'admin', body.detail);
  return c.json({ ok: true, subscription });
});

subscriptions.post('/admin/refund-sync', async (c) => {
  const admin = requireAdmin(c);
  if (admin instanceof Response) return admin;
  const body = await c.req.json<{ userId?: string; reason?: string; actor?: string }>();
  if (!body.userId) return c.json({ code: 'invalid_request', message: 'userId is required' }, 400);
  const subscription = syncRefund(body.userId, body.actor ?? 'admin', body.reason);
  return c.json({ ok: true, subscription });
});

subscriptions.get('/admin/audit/:userId', (c) => {
  const admin = requireAdmin(c);
  if (admin instanceof Response) return admin;
  const userId = c.req.param('userId');
  return c.json({ userId, timeline: getSubscriptionAuditTimeline(userId), subscription: getSubscription(userId) });
});

export default subscriptions;
