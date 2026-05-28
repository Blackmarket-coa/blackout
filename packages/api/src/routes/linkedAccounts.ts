import { Hono } from 'hono';
import { z } from 'zod';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { authRateLimit } from '../middleware/rate-limit';
import {
  isLinkedAccountProvider,
  listLinkedAccounts,
  unlinkAccount,
  LINKED_ACCOUNT_PROVIDERS,
} from '../services/linkedAccounts';
import { getProviderOAuth } from '../services/oauthProviders';
import type { LinkedAccountProvider } from '../db/types';
import { log } from '../telemetry/logger';

const linkedAccounts = new Hono();

linkedAccounts.use('/:provider/connect', authRateLimit);
linkedAccounts.use('/:provider/callback', authRateLimit);

const callbackSchema = z.object({
  code: z.string().min(1).max(2048),
  state: z.string().min(1).max(2048),
});

/** GET /linked-accounts — list this user's linked third-party identities. */
linkedAccounts.get('/', (c) => {
  const userOrResp = requireUser(c, 'Sign in required to list linked accounts');
  if (userOrResp instanceof Response) return userOrResp;
  return c.json({
    providers: LINKED_ACCOUNT_PROVIDERS,
    accounts: listLinkedAccounts(userOrResp.sub),
  });
});

/**
 * POST /linked-accounts/:provider/connect — start an OAuth link flow. Returns
 * the authorize URL the client should navigate the user to. The state token
 * is also returned so the client can sanity-check round-tripping.
 */
linkedAccounts.post('/:provider/connect', (c) => {
  const userOrResp = requireUser(c, 'Sign in required to link an account');
  if (userOrResp instanceof Response) return userOrResp;

  const provider = c.req.param('provider');
  if (!isLinkedAccountProvider(provider)) {
    return c.json(
      { code: 'unknown_provider', message: `Unknown provider "${provider}"`, supported: LINKED_ACCOUNT_PROVIDERS },
      400,
    );
  }

  const oauth = getProviderOAuth(provider);
  if (!oauth) {
    return c.json(
      {
        code: 'provider_not_implemented',
        message: `OAuth flow for "${provider}" is not yet implemented.`,
      },
      501,
    );
  }

  try {
    const result = oauth.beginLinkFlow(userOrResp.sub);
    return c.json(result);
  } catch (err) {
    log.error('linked_account_oauth_begin_failed', {
      error: String(err),
      userId: userOrResp.sub,
      provider,
    });
    return c.json({ code: 'oauth_misconfigured', message: 'OAuth client misconfigured' }, 503);
  }
});

/**
 * POST /linked-accounts/:provider/callback — finalize an OAuth link flow.
 * Body: { code, state }. The user must be authenticated as the same Blackout
 * account that initiated the flow.
 */
linkedAccounts.post('/:provider/callback', async (c) => {
  const userOrResp = requireUser(c, 'Sign in required to complete account linking');
  if (userOrResp instanceof Response) return userOrResp;

  const provider = c.req.param('provider') as LinkedAccountProvider | string;
  if (!isLinkedAccountProvider(provider)) {
    return c.json(
      { code: 'unknown_provider', message: `Unknown provider "${provider}"`, supported: LINKED_ACCOUNT_PROVIDERS },
      400,
    );
  }
  const oauth = getProviderOAuth(provider);
  if (!oauth) {
    return c.json(
      { code: 'provider_not_implemented', message: `Callback for "${provider}" is not yet implemented.` },
      501,
    );
  }

  const parsed = await readJsonBody(c, callbackSchema);
  if (parsed instanceof Response) return parsed;

  try {
    const outcome = await oauth.completeLinkFlow({
      userId: userOrResp.sub,
      code: parsed.code,
      state: parsed.state,
    });

    switch (outcome.kind) {
      case 'ok':
        return c.json({
          ok: true,
          provider: outcome.record.provider,
          providerUserId: outcome.record.providerUserId,
          providerUsername: outcome.record.providerUsername,
          scopes: outcome.record.scopes,
          expiresAt: outcome.record.expiresAt,
        });
      case 'state_invalid':
        return c.json({ code: 'state_invalid', message: 'OAuth state is unknown, expired, or already consumed.' }, 400);
      case 'state_expired':
        return c.json({ code: 'state_expired', message: 'OAuth state expired before callback completed.' }, 400);
      case 'state_mismatch':
        return c.json(
          { code: 'state_mismatch', message: 'OAuth state does not match the signed-in user or requested provider.' },
          400,
        );
      case 'token_exchange_failed':
        log.warn('oauth_token_exchange_failed', {
          provider,
          userId: userOrResp.sub,
          status: outcome.status,
          detail: outcome.detail,
        });
        return c.json(
          {
            code: 'token_exchange_failed',
            message: `${provider} rejected the authorization code.`,
            status: outcome.status,
          },
          502,
        );
      case 'identity_lookup_failed':
        log.warn('oauth_identity_lookup_failed', {
          provider,
          userId: userOrResp.sub,
          status: outcome.status,
          detail: outcome.detail,
        });
        return c.json(
          { code: 'identity_lookup_failed', message: `Could not load ${provider} identity.`, status: outcome.status },
          502,
        );
      default: {
        const exhaustive: never = outcome;
        return c.json({ code: 'unexpected_outcome', message: String(exhaustive) }, 500);
      }
    }
  } catch (err) {
    log.error('linked_account_oauth_complete_failed', {
      error: String(err),
      userId: userOrResp.sub,
      provider,
    });
    return c.json({ code: 'oauth_misconfigured', message: (err as Error).message }, 503);
  }
});

/** DELETE /linked-accounts/:provider — unlink. */
linkedAccounts.delete('/:provider', (c) => {
  const userOrResp = requireUser(c, 'Sign in required to unlink an account');
  if (userOrResp instanceof Response) return userOrResp;

  const provider = c.req.param('provider');
  if (!isLinkedAccountProvider(provider)) {
    return c.json(
      { code: 'unknown_provider', message: `Unknown provider "${provider}"`, supported: LINKED_ACCOUNT_PROVIDERS },
      400,
    );
  }

  const removed = unlinkAccount(userOrResp.sub, provider);
  if (!removed) {
    return c.json({ code: 'not_linked', message: `No ${provider} account is linked.` }, 404);
  }
  return c.json({ ok: true });
});

export default linkedAccounts;
