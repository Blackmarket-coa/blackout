import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { authRateLimit } from '../middleware/rate-limit';
import {
  createDestination,
  deleteDestination,
  listForUser,
  setEnabled,
  toSummary,
} from '../services/simulcastDestinations';
import { db } from '../db/store';

/**
 * /v1/integrations/simulcast/destinations CRUD.
 *
 * The plaintext stream key is accepted at create time; the response
 * NEVER includes the key after that. Toggling enabled/disabled is the
 * normal pause/resume path; deleting wipes the encrypted ciphertext
 * along with the row.
 */

const simulcast = new Hono();

simulcast.use('/', authRateLimit);
simulcast.use('/:id', authRateLimit);
simulcast.use('/:id/enabled', authRateLimit);

const createSchema = z.object({
  provider: z.string().min(1).max(32),
  label: z.string().min(1).max(64).optional(),
  ingestUrl: z.string().min(1).max(512),
  streamKey: z.string().min(1).max(512),
});

const enabledSchema = z.object({
  isEnabled: z.boolean(),
});

simulcast.get('/', (c) => {
  const userOrResp = requireUser(c, 'Sign in required to list simulcast destinations');
  if (userOrResp instanceof Response) return userOrResp;
  return c.json({ destinations: listForUser(userOrResp.sub) });
});

simulcast.post('/', async (c) => {
  const userOrResp = requireUser(c, 'Sign in required to create a simulcast destination');
  if (userOrResp instanceof Response) return userOrResp;
  const parsed = await readJsonBody(c, createSchema);
  if (parsed instanceof Response) return parsed;
  const out = createDestination({
    blackoutUserId: userOrResp.sub,
    provider: parsed.provider,
    label: parsed.label,
    ingestUrl: parsed.ingestUrl,
    streamKey: parsed.streamKey,
  });
  switch (out.kind) {
    case 'ok':
      // Return the summary only — never echo the streamKey back.
      return c.json({ destination: toSummary(out.record) }, 201);
    case 'invalid_input':
      return c.json({ code: 'invalid_input', message: out.reason }, 400);
    default: {
      const exhaustive: never = out;
      return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
    }
  }
});

simulcast.put('/:id/enabled', async (c) => {
  const userOrResp = requireUser(c, 'Sign in required to toggle a simulcast destination');
  if (userOrResp instanceof Response) return userOrResp;
  const id = c.req.param('id');
  const parsed = await readJsonBody(c, enabledSchema);
  if (parsed instanceof Response) return parsed;
  const out = setEnabled(userOrResp.sub, id, parsed.isEnabled);
  switch (out.kind) {
    case 'ok':
      return c.json({ destination: toSummary(out.record) });
    case 'not_found':
      return c.json({ code: 'not_found', message: 'No destination with that id.' }, 404);
    case 'forbidden':
      return c.json({ code: 'forbidden', message: 'You do not own that destination.' }, 403);
    default: {
      const exhaustive: never = out;
      return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
    }
  }
});

simulcast.delete('/:id', (c) => {
  const userOrResp = requireUser(c, 'Sign in required to delete a simulcast destination');
  if (userOrResp instanceof Response) return userOrResp;
  const id = c.req.param('id');
  const out = deleteDestination(userOrResp.sub, id);
  switch (out.kind) {
    case 'ok':
      return c.json({ ok: true });
    case 'not_found':
      return c.json({ code: 'not_found', message: 'No destination with that id.' }, 404);
    case 'forbidden':
      return c.json({ code: 'forbidden', message: 'You do not own that destination.' }, 403);
    default: {
      const exhaustive: never = out;
      return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
    }
  }
});

// Helper exported for cross-suite tests; keeps callers from poking db directly.
export const __routes_test__ = { db };

export default simulcast;
