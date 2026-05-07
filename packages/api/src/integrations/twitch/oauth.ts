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
 * Twitch OAuth2 authorization-code flow with PKCE (S256).
 *
 * Authorize: https://id.twitch.tv/oauth2/authorize
 * Token:     https://id.twitch.tv/oauth2/token
 * Identity:  https://api.twitch.tv/helix/users  (data[0])
 *
 * Configuration (env):
 *   TWITCH_CLIENT_ID         — required
 *   TWITCH_CLIENT_SECRET     — required
 *   TWITCH_OAUTH_REDIRECT_URI — required (must match the Developer Console)
 *   TWITCH_OAUTH_SCOPES      — optional, comma-separated, defaults below
 */

// Phase 1 scope set: identity (`user:read:email`) + the read scopes Twitch
// requires before our app can subscribe to the corresponding EventSub
// event types via Helix. Existing creators who linked Twitch before this
// scope set was widened need to re-link to grant the new scopes — the
// Settings UI shows a warning when the linked scopes are missing required
// entries.
const DEFAULT_SCOPES = [
  'user:read:email',
  'moderator:read:followers', // channel.follow v2
  'channel:read:subscriptions', // channel.subscribe + .subscription.gift
  'bits:read', // channel.cheer
];

const TWITCH_SPEC: ProviderSpec = {
  provider: 'twitch',
  authorizeUrl: 'https://id.twitch.tv/oauth2/authorize',
  tokenUrl: 'https://id.twitch.tv/oauth2/token',
  identityUrl: 'https://api.twitch.tv/helix/users',
  // force_verify=true makes Twitch always show the consent screen — important
  // when relinking the same account to ensure the user knows what scopes
  // they're granting.
  extraAuthorizeParams: { force_verify: 'true' },
  // Helix requires the Client-Id header on every request.
  identityExtraHeaders: (config) => ({ 'client-id': config.clientId }),
  parseIdentity: (json) => {
    const data = (json as { data?: Array<{ id: string; login: string; display_name: string }> })?.data;
    const me = data?.[0];
    if (!me) return null;
    return { providerUserId: me.id, providerUsername: me.display_name || me.login };
  },
};

let cachedConfig: ProviderOAuthConfig | null = null;

export const readTwitchOAuthConfig = (): ProviderOAuthConfig => {
  if (cachedConfig) return cachedConfig;
  const clientId = process.env.TWITCH_CLIENT_ID?.trim();
  const clientSecret = process.env.TWITCH_CLIENT_SECRET?.trim();
  const redirectUri = process.env.TWITCH_OAUTH_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Twitch OAuth not configured: set TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, and TWITCH_OAUTH_REDIRECT_URI.',
    );
  }
  const scopesRaw = process.env.TWITCH_OAUTH_SCOPES?.trim();
  const scopes = scopesRaw
    ? scopesRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : [...DEFAULT_SCOPES];
  cachedConfig = { clientId, clientSecret, redirectUri, scopes };
  return cachedConfig;
};

export const clearTwitchOAuthConfigCache = (): void => {
  cachedConfig = null;
};

export const beginLinkFlow = (userId: string): AuthorizeUrlResult =>
  beginFlow(TWITCH_SPEC, readTwitchOAuthConfig(), userId);

export const completeLinkFlow = (
  params: { userId: string; code: string; state: string },
  deps: CompleteFlowDeps = {},
): Promise<CallbackOutcome> =>
  completeFlow(TWITCH_SPEC, readTwitchOAuthConfig(), params, deps);

export const refreshLinkedAccount = (
  userId: string,
  deps: RefreshFlowDeps = {},
): Promise<RefreshOutcome> =>
  refreshFlow(TWITCH_SPEC, readTwitchOAuthConfig(), userId, deps);

// Re-export shared test hooks so existing tests keep working unchanged.
export { __test__ } from '../_oauth/providerFlow';
