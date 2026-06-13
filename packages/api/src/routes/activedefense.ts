import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { entitlementTierForUser } from '../services/subscriptions';
import {
  clampDecoyCount,
  generateDecoyData,
  isDecoyKind,
  listCanaries,
  mintCanary,
  tripCanary,
} from '../services/activeDefense';
import { ACTIVE_DEFENSE_ENTITLEMENT_KEYS, ACTIVE_DEFENSE_TIER_ENTITLEMENTS } from '@blackout/protocol';
import type { EntitlementTier } from '@blackout/protocol';

const activedefense = new Hono();

const tierHas = (tier: EntitlementTier, key: string): boolean =>
  Boolean((ACTIVE_DEFENSE_TIER_ENTITLEMENTS[tier] as Record<string, boolean>)[key]);

/** Entitlement gate: active defense is enterprise-only. */
const notEntitled = (key: string) =>
  ({
    code: 'active_defense_not_entitled',
    message: 'Active defense requires the Enterprise tier.',
    suggestedTier: 'enterprise' as const,
    capability: key,
  });

const CONSENT_MISSING = {
  code: 'active_defense_consent_required',
  message:
    'Active-defense actions require explicit admin consent. Resend with consent: true to acknowledge defensive, local-only use.',
};

const mintSchema = z.object({
  label: z.string().min(1).max(200),
  // Explicit operator acknowledgement that this is defensive, local-only use.
  // Validated separately so a missing acknowledgement returns a 403 consent
  // prompt rather than a generic 400.
  consent: z.boolean().optional(),
});

const tripSchema = z.object({
  token: z.string().min(1).max(200),
});

const decoySchema = z.object({
  kind: z.string().refine(isDecoyKind, 'kind must be contact, message, or credential'),
  count: z.number().int().positive().max(100).optional(),
  consent: z.boolean().optional(),
});

/** Mint a canary token (enterprise + explicit consent). */
activedefense.post('/canary-tokens', async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const tier = entitlementTierForUser(user.sub);
  if (!tierHas(tier, ACTIVE_DEFENSE_ENTITLEMENT_KEYS.canaryTokens)) {
    return c.json(notEntitled(ACTIVE_DEFENSE_ENTITLEMENT_KEYS.canaryTokens), 402);
  }

  const parsed = await readJsonBody(c, mintSchema);
  if (parsed instanceof Response) return parsed;
  if (parsed.consent !== true) return c.json(CONSENT_MISSING, 403);

  const result = mintCanary(user.sub, parsed.label);
  if (result.kind === 'limit_reached') {
    return c.json(
      { code: 'canary_limit_reached', message: `Canary token limit reached (${result.cap}).` },
      409,
    );
  }
  return c.json({ canary: result.record }, 201);
});

/** List the caller's canary tokens and their trip status. */
activedefense.get('/canary-tokens', (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  return c.json({ canaries: listCanaries(user.sub) });
});

/**
 * Record that one of the caller's canaries was accessed (defensive alert).
 * Owner-scoped today; a public tripwire route is a tracked follow-up.
 */
activedefense.post('/canary-tokens/trip', async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const tier = entitlementTierForUser(user.sub);
  if (!tierHas(tier, ACTIVE_DEFENSE_ENTITLEMENT_KEYS.canaryTokens)) {
    return c.json(notEntitled(ACTIVE_DEFENSE_ENTITLEMENT_KEYS.canaryTokens), 402);
  }

  const parsed = await readJsonBody(c, tripSchema);
  if (parsed instanceof Response) return parsed;

  const owned = listCanaries(user.sub).some((canary) => canary.token === parsed.token);
  if (!owned) {
    return c.json({ code: 'canary_not_found', message: 'No such canary token for this account.' }, 404);
  }

  const updated = tripCanary(parsed.token);
  return c.json({ canary: updated });
});

/** Generate clearly-synthetic decoy data (enterprise + explicit consent). */
activedefense.post('/decoy-data', async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const tier = entitlementTierForUser(user.sub);
  if (!tierHas(tier, ACTIVE_DEFENSE_ENTITLEMENT_KEYS.decoyData)) {
    return c.json(notEntitled(ACTIVE_DEFENSE_ENTITLEMENT_KEYS.decoyData), 402);
  }

  const parsed = await readJsonBody(c, decoySchema);
  if (parsed instanceof Response) return parsed;
  if (parsed.consent !== true) return c.json(CONSENT_MISSING, 403);

  if (!isDecoyKind(parsed.kind)) {
    return c.json({ code: 'invalid_decoy_kind', message: 'Unsupported decoy kind.' }, 400);
  }

  const count = clampDecoyCount(parsed.count ?? 1);
  return c.json({ kind: parsed.kind, count, records: generateDecoyData(parsed.kind, count) });
});

export default activedefense;

export { CONSENT_MISSING };
