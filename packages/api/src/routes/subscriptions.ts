import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { requireUser } from '../middleware/require-user';
import { readJsonBody } from '../middleware/validate';
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
    const session = createCheckoutSession({
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
  return c.json(createCustomerPortalSession(user.sub, returnUrl));
});

subscriptions.post('/webhooks/lago', async (c) => {
  const parsed = await readJsonBody(c, webhookSchema);
  if (parsed instanceof Response) return parsed;

  const result = applySubscriptionWebhookEvent(parsed as SubscriptionWebhookEvent);
  return c.json({ ok: true, processed: result.processed, status: result.status, userId: result.userId });
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
  return c.json({ userId, timeline: getSubscriptionAuditTimeline(userId), subscription: getSubscription(userId) });
});

export default subscriptions;
