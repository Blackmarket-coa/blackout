import { Hono } from 'hono';
import { requireUser } from '../middleware/require-user';
import { authRateLimit } from '../middleware/rate-limit';
import { syncStreamlabsDonationsForUser } from '../services/streamlabsDonationSync';
import { log } from '../telemetry/logger';

/**
 * Manual donation-sync trigger. The creator's link is already established
 * via the generic /v1/linked-accounts/streamlabs/{connect,callback} flow;
 * this endpoint is what surfaces "pull my recent Streamlabs donations
 * into my widget bus right now" in the UI. A future commit will add a
 * scheduler that calls this on a creator-configurable cadence.
 */

const streamlabs = new Hono();
streamlabs.use('/sync', authRateLimit);

streamlabs.post('/sync', async (c) => {
  const userOrResp = requireUser(c, 'Sign in required to sync Streamlabs donations');
  if (userOrResp instanceof Response) return userOrResp;

  try {
    const outcome = await syncStreamlabsDonationsForUser(userOrResp.sub);
    switch (outcome.kind) {
      case 'ok':
        return c.json({
          ok: true,
          newDonations: outcome.newDonations,
          delivered: outcome.delivered,
          latestDonationId: outcome.latestDonationId,
        });
      case 'no_link':
        return c.json(
          { code: 'streamlabs_not_linked', message: 'Link Streamlabs in Settings → Linked accounts first.' },
          409,
        );
      case 'token_unavailable':
        log.warn('streamlabs_sync_token_unavailable', {
          userId: userOrResp.sub,
          reason: outcome.reason,
        });
        return c.json(
          {
            code: 'streamlabs_token_unavailable',
            message: 'Streamlabs token expired or revoked. Re-link from Settings.',
            reason: outcome.reason,
          },
          401,
        );
      case 'rate_limited':
        return c.json(
          {
            code: 'streamlabs_rate_limited',
            message: 'Streamlabs throttled the sync; try again shortly.',
            retryAfterSeconds: outcome.retryAfterSeconds,
          },
          429,
        );
      case 'failed':
        log.warn('streamlabs_sync_upstream_failed', {
          userId: userOrResp.sub,
          status: outcome.status,
          detail: outcome.detail,
        });
        return c.json(
          { code: 'streamlabs_upstream_failed', status: outcome.status },
          502,
        );
      default: {
        const exhaustive: never = outcome;
        return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
      }
    }
  } catch (err) {
    log.error('streamlabs_sync_threw', { userId: userOrResp.sub, error: String(err) });
    return c.json({ code: 'internal_error', message: (err as Error).message }, 500);
  }
});

export default streamlabs;
