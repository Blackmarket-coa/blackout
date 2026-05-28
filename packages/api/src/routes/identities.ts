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
} from '../services/burnerIdentities';
import type { BurnerIdentityRecord } from '../db/types';

const identities = new Hono();

// Account creation is expensive (a real Synapse user per call); rate-limit it.
identities.use('/', authRateLimit);

const createSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  ttlHours: z.number().int().min(1).max(MAX_BURNER_TTL_HOURS).optional(),
});

const publicShape = (record: BurnerIdentityRecord) => ({
  id: record.id,
  burnerUserId: record.burnerUserId,
  label: record.label,
  expiresAt: record.expiresAt,
  burnedAt: record.burnedAt,
  createdAt: record.createdAt,
});

identities.post('/', async (c) => {
  const user = requireUser(c);
  if (user instanceof Response) return user;

  const parsed = await readJsonBody(c, createSchema);
  if (parsed instanceof Response) return parsed;

  const outcome = await createBurnerForOwner({
    ownerUserId: user.sub,
    label: parsed.label,
    ttlHours: parsed.ttlHours,
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
