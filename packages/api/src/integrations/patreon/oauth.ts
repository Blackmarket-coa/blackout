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
 * Patreon OAuth2 (V2 API) authorization-code flow with PKCE (S256).
 *
 * Authorize: https://www.patreon.com/oauth2/authorize
 * Token:     https://www.patreon.com/api/oauth2/token
 * Identity:  https://www.patreon.com/api/oauth2/v2/identity (JSON:API shape)
 *
 * Configuration (env):
 *   PATREON_CLIENT_ID         — required
 *   PATREON_CLIENT_SECRET     — required
 *   PATREON_OAUTH_REDIRECT_URI — required
 *   PATREON_OAUTH_SCOPES      — optional, comma-separated, defaults below
 */

// Identity is requested with explicit field selection so we get full_name
// without making the user grant the broader `identity[email]` scope.
const IDENTITY_URL =
  'https://www.patreon.com/api/oauth2/v2/identity' +
  '?' +
  new URLSearchParams({ 'fields[user]': 'full_name,vanity' }).toString();

const DEFAULT_SCOPES = ['identity', 'campaigns', 'campaigns.members'];

const PATREON_SPEC: ProviderSpec = {
  provider: 'patreon',
  authorizeUrl: 'https://www.patreon.com/oauth2/authorize',
  tokenUrl: 'https://www.patreon.com/api/oauth2/token',
  identityUrl: IDENTITY_URL,
  parseIdentity: (json) => {
    // Patreon V2 returns JSON:API: { data: { id, type, attributes } }.
    const data = (json as { data?: { id?: string; attributes?: { full_name?: string; vanity?: string } } })?.data;
    if (!data?.id) return null;
    const attrs = data.attributes ?? {};
    return {
      providerUserId: data.id,
      providerUsername: attrs.full_name || attrs.vanity || undefined,
    };
  },
};

let cachedConfig: ProviderOAuthConfig | null = null;

export const readPatreonOAuthConfig = (): ProviderOAuthConfig => {
  if (cachedConfig) return cachedConfig;
  const clientId = process.env.PATREON_CLIENT_ID?.trim();
  const clientSecret = process.env.PATREON_CLIENT_SECRET?.trim();
  const redirectUri = process.env.PATREON_OAUTH_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Patreon OAuth not configured: set PATREON_CLIENT_ID, PATREON_CLIENT_SECRET, and PATREON_OAUTH_REDIRECT_URI.',
    );
  }
  const scopesRaw = process.env.PATREON_OAUTH_SCOPES?.trim();
  const scopes = scopesRaw
    ? scopesRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : [...DEFAULT_SCOPES];
  cachedConfig = { clientId, clientSecret, redirectUri, scopes };
  return cachedConfig;
};

export const clearPatreonOAuthConfigCache = (): void => {
  cachedConfig = null;
};

export const beginLinkFlow = (userId: string): AuthorizeUrlResult =>
  beginFlow(PATREON_SPEC, readPatreonOAuthConfig(), userId);

export const completeLinkFlow = (
  params: { userId: string; code: string; state: string },
  deps: CompleteFlowDeps = {},
): Promise<CallbackOutcome> =>
  completeFlow(PATREON_SPEC, readPatreonOAuthConfig(), params, deps);

export const refreshLinkedAccount = (
  userId: string,
  deps: RefreshFlowDeps = {},
): Promise<RefreshOutcome> =>
  refreshFlow(PATREON_SPEC, readPatreonOAuthConfig(), userId, deps);
