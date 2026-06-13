import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { authRateLimit } from '../middleware/rate-limit';
import {
  MAX_BURNER_TTL_HOURS,
  burnBurner,
  createBurnerForOwner,
  listBurnersForOwner,
  listPersonaRosterForOwner,
  rotatePersonaForOwner,
} from '../services/burnerIdentities';
import { userHasPrivacyFeature } from '../services/privacyEntitlements';
import { entitlementTierForUser } from '../services/subscriptions';
import { PERSONA_ENTITLEMENT_KEYS, PERSONA_TIER_ENTITLEMENTS } from '@blackout/protocol';
import type { BurnerIdentityRecord } from '../db/types';

const identities = new Hono();

// Account creation is expensive (a real Synapse user per call); rate-limit it.
identities.use('/', authRateLimit);

/** Server-side check of a boolean persona entitlement for the user's tier. */
const personaEntitled = (userId: string, key: string): boolean => {
  const tier = entitlementTierForUser(userId);
  return Boolean((PERSONA_TIER_ENTITLEMENTS[tier] as Record<string, boolean>)[key]);
};

const createSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  ttlHours: z.number().int().min(1).max(MAX_BURNER_TTL_HOURS).optional(),
  compartmentId: z.string().trim().min(1).max(64).optional(),
  rootKeyCommitment: z
    .string()
    .regex(/^[0-9a-f]{64}$/, 'rootKeyCommitment must be a lower-hex SHA-256 digest')
    .optional(),
});

const publicShape = (record: BurnerIdentityRecord) => ({
  id: record.id,
  burnerUserId: record.burnerUserId,
  label: record.label,
  expiresAt: record.expiresAt,
  burnedAt: record.burnedAt,
  createdAt: record.createdAt,
  compartmentId: record.compartmentId ?? null,
  rotationEpoch: record.rotationEpoch ?? 0,
});

identities.post('/', async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const parsed = await readJsonBody(c, createSchema);
  if (parsed instanceof Response) return parsed;

  // Roster cap is driven by the canonical PERSONA_QUOTAS for the user's tier.
  // Back-compat: a legacy `burner_pro` privacy grant still raises a free-tier
  // user to the `pro` cap for one release while grants migrate to plan tiers.
  let tier = entitlementTierForUser(user.sub);
  if (tier === 'free' && userHasPrivacyFeature(user.sub, 'burner_pro')) {
    tier = 'pro';
  }

  // Compartmentalized personas are a paid capability.
  if (parsed.compartmentId && !personaEntitled(user.sub, PERSONA_ENTITLEMENT_KEYS.compartments)) {
    return c.json(
      {
        code: 'compartments_not_entitled',
        message: 'Persona compartments require the Pro tier or higher.',
        suggestedTier: 'pro',
      },
      402,
    );
  }

  const outcome = await createBurnerForOwner({
    ownerUserId: user.sub,
    label: parsed.label,
    ttlHours: parsed.ttlHours,
    tier,
    compartmentId: parsed.compartmentId,
    rootKeyCommitment: parsed.rootKeyCommitment,
  });

  switch (outcome.kind) {
    case 'ok':
      return c.json(
        {
          burner: publicShape(outcome.record),
          // Returned exactly once; the client logs in with it and discards it.
          password: outcome.password,
          baseUrl: outcome.baseUrl,
        },
        201,
      );
    case 'cap_reached':
      return c.json(
        {
          code: 'cap_reached',
          message: `You already have the maximum of ${outcome.cap} active burner ${
            outcome.cap === 1 ? 'identity' : 'identities'
          }. Burn one before creating another.`,
          cap: outcome.cap,
        },
        409,
      );
    case 'matrix_unavailable':
      return c.json(
        {
          code: 'matrix_unavailable',
          message:
            'Could not provision a burner account. Check that MATRIX_HOMESERVER and MATRIX_BOT_TOKEN are configured and the bot has admin rights.',
          reason: outcome.reason,
          detail: outcome.detail,
        },
        503,
      );
  }
});

identities.get('/', (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  return c.json({ burners: listBurnersForOwner(user.sub).map(publicShape) });
});

// Active personas grouped by compartment, for the roster UI.
identities.get('/roster', (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;
  const groups = listPersonaRosterForOwner(user.sub).map((group) => ({
    compartmentId: group.compartmentId,
    personas: group.personas.map(publicShape),
  }));
  return c.json({ roster: groups });
});

// Bump a persona's alias-rotation epoch (the client re-derives aliases from it).
identities.post('/:burnerUserId/rotate', (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  if (!personaEntitled(user.sub, PERSONA_ENTITLEMENT_KEYS.rotation)) {
    return c.json(
      {
        code: 'rotation_not_entitled',
        message: 'Alias rotation requires the Pro tier or higher.',
        suggestedTier: 'pro',
      },
      402,
    );
  }

  const outcome = rotatePersonaForOwner({
    ownerUserId: user.sub,
    burnerUserId: c.req.param('burnerUserId'),
  });

  if (outcome.kind === 'not_found') {
    return c.json({ code: 'not_found', message: 'Burner identity not found' }, 404);
  }
  return c.json({ burner: publicShape(outcome.record) });
});

identities.post('/:burnerUserId/burn', async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const outcome = await burnBurner({
    ownerUserId: user.sub,
    burnerUserId: c.req.param('burnerUserId'),
  });

  switch (outcome.kind) {
    case 'ok':
      return c.json({ burner: publicShape(outcome.record) });
    case 'not_found':
      return c.json({ code: 'not_found', message: 'Burner identity not found' }, 404);
    case 'matrix_unavailable':
      return c.json(
        {
          code: 'matrix_unavailable',
          message: 'Could not deactivate the burner account on the homeserver.',
          reason: outcome.reason,
          detail: outcome.detail,
        },
        503,
      );
  }
});

export default identities;
