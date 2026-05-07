import { Hono } from 'hono';
import { requireUser } from '../middleware/require-user';
import { buildIntegrationsHealthSnapshot } from '../services/integrationsHealth';

/**
 * GET /v1/integrations/health
 *
 * Returns a single-shot snapshot of every integration's runtime +
 * persisted state for the authenticated creator. Powers the
 * Settings → "Integrations health" panel.
 *
 * Read-only; no rate limit beyond the global one — the response is
 * small + cheap (in-memory store walk + a couple of env checks) and
 * the panel polls every ~10 s on the client.
 */
const integrationsHealth = new Hono();

integrationsHealth.get('/', (c) => {
  const userOrResp = requireUser(c, 'Sign in required to view integrations health');
  if (userOrResp instanceof Response) return userOrResp;
  const snapshot = buildIntegrationsHealthSnapshot(userOrResp.sub);
  return c.json(snapshot);
});

export default integrationsHealth;
