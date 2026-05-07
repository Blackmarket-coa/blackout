import {
  beginFlow,
  completeFlow,
  type AuthorizeUrlResult,
  type CallbackOutcome,
  type CompleteFlowDeps,
  type ProviderOAuthConfig,
  type ProviderSpec,
} from '../_oauth/providerFlow';

/**
 * Discord OAuth2 authorization-code flow with PKCE (S256).
 *
 * Authorize: https://discord.com/oauth2/authorize
 * Token:     https://discord.com/api/oauth2/token
 * Identity:  https://discord.com/api/users/@me
 *
 * Configuration (env):
 *   DISCORD_CLIENT_ID         — required
 *   DISCORD_CLIENT_SECRET     — required
 *   DISCORD_OAUTH_REDIRECT_URI — required (must match the Developer Portal)
 *   DISCORD_OAUTH_SCOPES      — optional, comma-separated, defaults below
 *
 * Note: Discord OAuth lives within the Discord ToS, which forbids "imitating"
 * the Discord API outbound. We only OUTBOUND-call Discord to verify identity
 * + capture the user's token; we never reuse this token against Discord on
 * the user's behalf except via clearly-attributed integrations they opt
 * into.
 */

const DEFAULT_SCOPES = ['identify', 'email'];

const DISCORD_SPEC: ProviderSpec = {
  provider: 'discord',
  authorizeUrl: 'https://discord.com/oauth2/authorize',
  tokenUrl: 'https://discord.com/api/oauth2/token',
  identityUrl: 'https://discord.com/api/users/@me',
  // `prompt=consent` forces re-display of the consent screen on relink so
  // the user knows what scopes they're granting now (Discord's default is
  // to silently re-authorize previously-granted apps).
  extraAuthorizeParams: { prompt: 'consent' },
  parseIdentity: (json) => {
    const user = json as {
      id?: string;
      username?: string;
      global_name?: string | null;
      discriminator?: string;
    };
    if (!user?.id) return null;
    // global_name is the new "display name" (post legacy-discriminator era).
    // Fall back to username if it's null (older accounts) or missing.
    const username = user.global_name ?? user.username ?? undefined;
    return { providerUserId: user.id, providerUsername: username };
  },
};

let cachedConfig: ProviderOAuthConfig | null = null;

export const readDiscordOAuthConfig = (): ProviderOAuthConfig => {
  if (cachedConfig) return cachedConfig;
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();
  const redirectUri = process.env.DISCORD_OAUTH_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Discord OAuth not configured: set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, and DISCORD_OAUTH_REDIRECT_URI.',
    );
  }
  const scopesRaw = process.env.DISCORD_OAUTH_SCOPES?.trim();
  const scopes = scopesRaw
    ? scopesRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : [...DEFAULT_SCOPES];
  cachedConfig = { clientId, clientSecret, redirectUri, scopes };
  return cachedConfig;
};

export const clearDiscordOAuthConfigCache = (): void => {
  cachedConfig = null;
};

export const beginLinkFlow = (userId: string): AuthorizeUrlResult =>
  beginFlow(DISCORD_SPEC, readDiscordOAuthConfig(), userId);

export const completeLinkFlow = (
  params: { userId: string; code: string; state: string },
  deps: CompleteFlowDeps = {},
): Promise<CallbackOutcome> =>
  completeFlow(DISCORD_SPEC, readDiscordOAuthConfig(), params, deps);
