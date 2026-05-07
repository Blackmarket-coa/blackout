import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { authRateLimit } from '../middleware/rate-limit';
import {
  deleteSubscription,
  deliverToSubscription,
  listForUser,
  register,
  type BlackoutEvent,
} from '../services/outboundEventWebhooks';
import type { OutboundEventType, OutboundEventWebhookRecord } from '../db/types';
import { db } from '../db/store';

const router = new Hono();
router.use('/', authRateLimit);
router.use('/:id', authRateLimit);
router.use('/:id/test', authRateLimit);

const eventTypeSchema = z.enum([
  'tip.created',
  'follow.created',
  'livestream.started',
  'livestream.ended',
  'chat.message.received',
] as const);

const registerSchema = z.object({
  name: z.string().min(1).max(80),
  targetUrl: z.string().min(1).max(2048),
  eventTypes: z.array(eventTypeSchema).default([]),
});

const testDeliverSchema = z.object({
  /** Plaintext signing secret echoed back from the create-time response. */
  signingSecret: z.string().min(1).max(255),
  /** Synthetic event type to fire. */
  eventType: eventTypeSchema,
  /** Free-form data to render into embed fields. */
  data: z.record(z.string(), z.unknown()).default({}),
});

const projectRecord = (record: OutboundEventWebhookRecord) => ({
  id: record.id,
  name: record.name,
  targetUrl: record.targetUrl,
  eventTypes: record.eventTypes,
  isActive: record.isActive,
  consecutiveFailures: record.consecutiveFailures,
  lastDeliveryAt: record.lastDeliveryAt,
  lastStatus: record.lastStatus,
  lastError: record.lastError,
  deliveryCount: record.deliveryCount,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

router.get('/', (c) => {
  const userOrResp = requireUser(c, 'Sign in required to list outbound event webhooks');
  if (userOrResp instanceof Response) return userOrResp;
  return c.json({ subscriptions: listForUser(userOrResp.sub).map(projectRecord) });
});

router.post('/', async (c) => {
  const userOrResp = requireUser(c, 'Sign in required to register an outbound event webhook');
  if (userOrResp instanceof Response) return userOrResp;
  const parsed = await readJsonBody(c, registerSchema);
  if (parsed instanceof Response) return parsed;

  const out = register({
    blackoutUserId: userOrResp.sub,
    name: parsed.name,
    targetUrl: parsed.targetUrl,
    eventTypes: parsed.eventTypes as OutboundEventType[],
  });
  switch (out.kind) {
    case 'ok':
      return c.json(
        {
          subscription: projectRecord(out.record),
          // The signing secret is shown ONCE — the UI must surface it
          // immediately for the creator to copy into receiver config.
          signingSecret: out.signingSecret,
        },
        201,
      );
    case 'invalid_input':
      return c.json({ code: 'invalid_input', message: out.reason }, 400);
    default: {
      const exhaustive: never = out;
      return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
    }
  }
});

router.delete('/:id', (c) => {
  const userOrResp = requireUser(c, 'Sign in required to delete an outbound event webhook');
  if (userOrResp instanceof Response) return userOrResp;
  const id = c.req.param('id');
  const out = deleteSubscription(userOrResp.sub, id);
  switch (out.kind) {
    case 'ok':
      return c.json({ ok: true });
    case 'not_found':
      return c.json({ code: 'not_found', message: 'No subscription with that id.' }, 404);
    case 'forbidden':
      return c.json({ code: 'forbidden', message: 'You do not own that subscription.' }, 403);
    default: {
      const exhaustive: never = out;
      return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
    }
  }
});

/**
 * Manual fire-once endpoint. The caller (the Settings UI) holds the
 * plaintext signing secret in memory after the create-time reveal and
 * passes it back here so we can sign the test delivery. This is the
 * MVP wiring for "verify your webhook works" before any real event
 * source has been hooked up.
 */
router.post('/:id/test', async (c) => {
  const userOrResp = requireUser(c, 'Sign in required to test an outbound event webhook');
  if (userOrResp instanceof Response) return userOrResp;
  const id = c.req.param('id');
  const record = db.getOutboundEventWebhook(id);
  if (!record) {
    return c.json({ code: 'not_found', message: 'No subscription with that id.' }, 404);
  }
  if (record.blackoutUserId !== userOrResp.sub) {
    return c.json({ code: 'forbidden', message: 'You do not own that subscription.' }, 403);
  }
  const parsed = await readJsonBody(c, testDeliverSchema);
  if (parsed instanceof Response) return parsed;

  const event: BlackoutEvent = {
    type: parsed.eventType as OutboundEventType,
    blackoutUserId: userOrResp.sub,
    data: parsed.data,
    occurredAt: new Date().toISOString(),
  };
  const report = await deliverToSubscription(record, event, {
    signingSecret: parsed.signingSecret,
  });
  return c.json({ report });
});

export default router;
