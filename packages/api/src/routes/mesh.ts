import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { entitlementTierForUser } from '../services/subscriptions';
import {
  enqueueEnvelope,
  listForRecipient,
  syncWithPeer,
} from '../services/meshRelay';
import { MESH_ENTITLEMENT_KEYS, MESH_TIER_ENTITLEMENTS } from '@blackout/protocol';
import type { EntitlementTier, MeshEnvelope } from '@blackout/protocol';

const mesh = new Hono();

const tierHas = (tier: EntitlementTier, key: string): boolean =>
  Boolean((MESH_TIER_ENTITLEMENTS[tier] as Record<string, boolean>)[key]);

const notEntitled = (key: string) => ({
  code: 'mesh_not_entitled',
  message: 'Mesh / offline transport requires the Enterprise tier.',
  suggestedTier: 'enterprise' as const,
  capability: key,
});

const enqueueSchema = z.object({
  recipient: z.string().min(1).max(255),
  payload: z.string().min(1).max(64 * 1024),
  ttlSeconds: z.number().int().positive().max(30 * 24 * 60 * 60).optional(),
  maxHops: z.number().int().positive().max(32).optional(),
});

const envelopeSchema = z.object({
  id: z.string().min(1).max(200),
  sender: z.string().min(1).max(255),
  recipient: z.string().min(1).max(255),
  payload: z.string().min(1).max(64 * 1024),
  createdAt: z.string().min(1),
  expiresAt: z.string().min(1),
  hopCount: z.number().int().min(0).max(1000),
  maxHops: z.number().int().min(1).max(1000),
  seenBy: z.array(z.string().max(255)).max(1000),
});

const syncSchema = z.object({
  peerNodeId: z.string().min(1).max(255),
  envelopes: z.array(envelopeSchema).max(500),
});

/** Originate an envelope into the mesh (enterprise). */
mesh.post('/enqueue', async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const tier = entitlementTierForUser(user.sub);
  if (!tierHas(tier, MESH_ENTITLEMENT_KEYS.storeForward)) {
    return c.json(notEntitled(MESH_ENTITLEMENT_KEYS.storeForward), 402);
  }

  const parsed = await readJsonBody(c, enqueueSchema);
  if (parsed instanceof Response) return parsed;

  const envelope = enqueueEnvelope({ sender: user.sub, ...parsed });
  return c.json({ envelope }, 201);
});

/** Gossip sync with a peer node: merge their envelopes, return what they lack. */
mesh.post('/sync', async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const tier = entitlementTierForUser(user.sub);
  if (!tierHas(tier, MESH_ENTITLEMENT_KEYS.peerSync)) {
    return c.json(notEntitled(MESH_ENTITLEMENT_KEYS.peerSync), 402);
  }

  const parsed = await readJsonBody(c, syncSchema);
  if (parsed instanceof Response) return parsed;

  const result = syncWithPeer(parsed.peerNodeId, parsed.envelopes as MeshEnvelope[]);
  return c.json({ accepted: result.accepted, toForward: result.toForward });
});

/** Pull live envelopes addressed to the caller (delivery). */
mesh.get('/inbox', (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const tier = entitlementTierForUser(user.sub);
  if (!tierHas(tier, MESH_ENTITLEMENT_KEYS.enabled)) {
    return c.json(notEntitled(MESH_ENTITLEMENT_KEYS.enabled), 402);
  }

  return c.json({ envelopes: listForRecipient(user.sub) });
});

export default mesh;
