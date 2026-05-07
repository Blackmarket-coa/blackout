import * as twitchOAuth from '../integrations/twitch/oauth';
import * as discordOAuth from '../integrations/discord/oauth';
import * as patreonOAuth from '../integrations/patreon/oauth';
import * as youtubeOAuth from '../integrations/youtube/oauth';
import * as streamlabsOAuth from '../integrations/streamlabs/oauth';
import type {
  AuthorizeUrlResult,
  CallbackOutcome,
  CompleteFlowDeps,
  RefreshFlowDeps,
  RefreshOutcome,
} from '../integrations/_oauth/providerFlow';
import { decryptLinkedAccount } from './linkedAccounts';
import type { LinkedAccountProvider } from '../db/types';

/**
 * Single source of truth for the four wire-protocol OAuth providers shipped
 * in Phase 0. Routes, schedulers, and feature code that need to invoke an
 * OAuth flow for a given provider should go through this registry rather
 * than importing individual provider modules.
 *
 * Adding a new provider:
 *   1) Add `integrations/<name>/oauth.ts` exporting the four functions
 *      below (begin/complete/refresh).
 *   2) Drop a row into `OAUTH_PROVIDERS`.
 *   3) Update `IMPLEMENTED_PROVIDERS` on the client side to match.
 */

export interface ProviderOAuthModule {
  beginLinkFlow: (userId: string) => AuthorizeUrlResult;
  completeLinkFlow: (
    params: { userId: string; code: string; state: string },
    deps?: CompleteFlowDeps,
  ) => Promise<CallbackOutcome>;
  refreshLinkedAccount: (userId: string, deps?: RefreshFlowDeps) => Promise<RefreshOutcome>;
}

export const OAUTH_PROVIDERS: Partial<Record<LinkedAccountProvider, ProviderOAuthModule>> = {
  twitch: twitchOAuth,
  discord: discordOAuth,
  patreon: patreonOAuth,
  youtube: youtubeOAuth,
  streamlabs: streamlabsOAuth,
};

export const isOAuthImplemented = (provider: LinkedAccountProvider): boolean =>
  Boolean(OAUTH_PROVIDERS[provider]);

export const getProviderOAuth = (
  provider: LinkedAccountProvider,
): ProviderOAuthModule | undefined => OAUTH_PROVIDERS[provider];

// ----------------------------- access-token freshness -----------------------------

/**
 * Refresh slightly before the token actually expires so a token that's "about
 * to expire" can't slip into a Helix / Discord REST call and blow up with a
 * 401 mid-request.
 */
const REFRESH_LEEWAY_SECONDS = 60;

export type EnsureFreshOutcome =
  | { kind: 'ok'; accessToken: string; rotated: boolean; expiresAt?: string }
  | { kind: 'no_link' }
  | { kind: 'no_refresh_token'; accessToken?: string }
  | { kind: 'refresh_failed'; status: number; detail: string }
  | { kind: 'provider_not_implemented' };

const isAccessTokenFresh = (expiresAt: string | undefined, leeway: number): boolean => {
  if (!expiresAt) return true; // unknown / non-expiring → assume fresh
  return new Date(expiresAt).getTime() - Date.now() > leeway * 1000;
};

export interface EnsureFreshOptions {
  /** Override the refresh leeway (seconds). Useful for tests + tight retry loops. */
  leewaySeconds?: number;
  /** Pluggable fetch passed through to the underlying refresh call. */
  fetch?: typeof fetch;
  /** If true, force a refresh even when the access token still has time. */
  forceRefresh?: boolean;
}

/**
 * Returns a plaintext access token guaranteed (best-effort) to be valid for
 * at least `leewaySeconds` more. Internal callers (e.g. Phase 1 chat ingress
 * and Helix proxies) should always go through this rather than reading the
 * stored access token directly, so refresh happens transparently.
 *
 * Returns the relevant {@link EnsureFreshOutcome}; never throws on API errors,
 * so callers can match on the outcome and decide how to react.
 */
export const ensureFreshAccessToken = async (
  userId: string,
  provider: LinkedAccountProvider,
  options: EnsureFreshOptions = {},
): Promise<EnsureFreshOutcome> => {
  const oauth = OAUTH_PROVIDERS[provider];
  if (!oauth) return { kind: 'provider_not_implemented' };

  const decrypted = decryptLinkedAccount(userId, provider);
  if (!decrypted) return { kind: 'no_link' };

  const leeway = options.leewaySeconds ?? REFRESH_LEEWAY_SECONDS;
  if (!options.forceRefresh && isAccessTokenFresh(decrypted.record.expiresAt, leeway)) {
    return {
      kind: 'ok',
      accessToken: decrypted.accessToken,
      rotated: false,
      expiresAt: decrypted.record.expiresAt,
    };
  }

  // Token is stale (or refresh forced). Refresh — but if there's no refresh
  // token to use, surface that to the caller; the access token MAY still be
  // usable for a few seconds (some providers issue long-lived access tokens
  // with no refresh token).
  if (!decrypted.refreshToken) {
    return { kind: 'no_refresh_token', accessToken: decrypted.accessToken };
  }

  const result = await oauth.refreshLinkedAccount(userId, { fetch: options.fetch });
  switch (result.kind) {
    case 'ok':
      return { kind: 'ok', accessToken: result.accessToken, rotated: true, expiresAt: result.expiresAt };
    case 'no_link':
      return { kind: 'no_link' };
    case 'no_refresh_token':
      return { kind: 'no_refresh_token', accessToken: decrypted.accessToken };
    case 'refresh_failed':
      return { kind: 'refresh_failed', status: result.status, detail: result.detail };
    default: {
      const exhaustive: never = result;
      return exhaustive;
    }
  }
};
