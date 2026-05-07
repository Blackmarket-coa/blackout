import {
  beginFlow,
  completeFlow,
  refreshFlow,
  type AuthorizeUrlResult,
  type CallbackOutcome,
  type CompleteFlowDeps,
  type ProviderOAuthConfig,
  type ProviderSpec,
  type RefreshFlowDeps,
  type RefreshOutcome,
} from '../_oauth/providerFlow';

/**
 * Streamlabs OAuth2 (v2.0 API) authorization-code flow with PKCE (S256).
 *
 * Authorize: https://www.streamlabs.com/api/v2.0/authorize
 * Token:     https://www.streamlabs.com/api/v2.0/token
 * Identity:  https://www.streamlabs.com/api/v2.0/user
 *
 * Configuration (env):
 *   STREAMLABS_CLIENT_ID         — required
 *   STREAMLABS_CLIENT_SECRET     — required
 *   STREAMLABS_OAUTH_REDIRECT_URI — required
 *   STREAMLABS_OAUTH_SCOPES      — optional, comma-separated, defaults below
 *
 * Streamlabs is a service layered on top of streaming platforms — not a
 * platform a creator streams on — but it lives in the same `linked_accounts`
 * table as the streaming providers because the auth + token-storage
 * primitives are identical. The frontend Settings UI can render it under a
 * separate header if it wants ("Funding sources" vs "Platforms").
 */

// Donations.read is the minimum scope the donation-sync service requires.
// Socket.token unlocks the realtime socket.io stream we mirror in shape;
// we don't actually use the socket today (REST polling is simpler) but
// requesting it keeps the path open without a re-auth step.
const DEFAULT_SCOPES = ['donations.read', 'socket.token', 'points.read'];

const STREAMLABS_SPEC: ProviderSpec = {
  provider: 'streamlabs',
  authorizeUrl: 'https://www.streamlabs.com/api/v2.0/authorize',
  tokenUrl: 'https://www.streamlabs.com/api/v2.0/token',
  identityUrl: 'https://www.streamlabs.com/api/v2.0/user',
  parseIdentity: (json) => {
    // Streamlabs returns: { streamlabs: { id, display_name }, twitch: {...}, youtube: {...} }
    // We anchor on the `streamlabs.id` since that's the stable id in their
    // ecosystem; the platform-side fields are mirror data we don't depend on.
    const data = json as {
      streamlabs?: { id?: string | number; display_name?: string };
      twitch?: { display_name?: string };
    };
    const id = data.streamlabs?.id;
    if (id === undefined) return null;
    return {
      providerUserId: String(id),
      providerUsername:
        data.streamlabs?.display_name || data.twitch?.display_name || undefined,
    };
  },
};

let cachedConfig: ProviderOAuthConfig | null = null;

export const readStreamlabsOAuthConfig = (): ProviderOAuthConfig => {
  if (cachedConfig) return cachedConfig;
  const clientId = process.env.STREAMLABS_CLIENT_ID?.trim();
  const clientSecret = process.env.STREAMLABS_CLIENT_SECRET?.trim();
  const redirectUri = process.env.STREAMLABS_OAUTH_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Streamlabs OAuth not configured: set STREAMLABS_CLIENT_ID, STREAMLABS_CLIENT_SECRET, and STREAMLABS_OAUTH_REDIRECT_URI.',
    );
  }
  const scopesRaw = process.env.STREAMLABS_OAUTH_SCOPES?.trim();
  const scopes = scopesRaw
    ? scopesRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : [...DEFAULT_SCOPES];
  cachedConfig = { clientId, clientSecret, redirectUri, scopes };
  return cachedConfig;
};

export const clearStreamlabsOAuthConfigCache = (): void => {
  cachedConfig = null;
};

export const beginLinkFlow = (userId: string): AuthorizeUrlResult =>
  beginFlow(STREAMLABS_SPEC, readStreamlabsOAuthConfig(), userId);

export const completeLinkFlow = (
  params: { userId: string; code: string; state: string },
  deps: CompleteFlowDeps = {},
): Promise<CallbackOutcome> =>
  completeFlow(STREAMLABS_SPEC, readStreamlabsOAuthConfig(), params, deps);

export const refreshLinkedAccount = (
  userId: string,
  deps: RefreshFlowDeps = {},
): Promise<RefreshOutcome> =>
  refreshFlow(STREAMLABS_SPEC, readStreamlabsOAuthConfig(), userId, deps);
