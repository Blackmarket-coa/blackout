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
import { createPublicKey, createVerify } from 'node:crypto';

function validateGoogleIdToken(idToken: string, clientId: string): string | null {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (typeof payload.sub !== 'string') return null;
    if (typeof payload.aud !== 'string') return null;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
    if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') return null;
    if (payload.aud !== clientId) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

/**
 * YouTube Live OAuth via Google's OAuth2 server.
 *
 * Authorize: https://accounts.google.com/o/oauth2/v2/auth
 * Token:     https://oauth2.googleapis.com/token
 * Identity:  https://www.googleapis.com/oauth2/v3/userinfo  (OIDC-shaped)
 *
 * Configuration (env):
 *   YOUTUBE_CLIENT_ID         — required (Google Cloud OAuth 2.0 Client ID)
 *   YOUTUBE_CLIENT_SECRET     — required
 *   YOUTUBE_OAUTH_REDIRECT_URI — required (must match an "Authorized
 *                               redirect URI" in the Google Cloud Console)
 *   YOUTUBE_OAUTH_SCOPES      — optional, comma-separated, defaults below
 *
 * Two Google-specific knobs are baked in:
 *   - access_type=offline so the token endpoint includes a refresh_token.
 *   - prompt=consent so the consent screen always re-renders, which also
 *     makes Google reissue the refresh_token on every relink (Google does
 *     NOT reissue refresh_tokens on silent reauth).
 *
 * Identity uses the OIDC userinfo endpoint instead of YouTube's own
 * channels.list because (a) it's free of the YouTube Data API quota, and
 * (b) `sub` is the stable Google user id that survives channel changes.
 */

// Default scopes:
//   openid + email + profile  → identity (sub, name, email)
//   youtube.readonly          → list the user's channels, fetch live chat
//                              (Phase 1 will subscribe to liveChatMessages)
const DEFAULT_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/youtube.readonly',
];

const YOUTUBE_SPEC: ProviderSpec = {
  provider: 'youtube',
  authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  identityUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
  extraAuthorizeParams: {
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  },
  parseIdentity: (json) => {
    const u = json as { sub?: string; name?: string; email?: string };
    if (!u?.sub) return null;
    return { providerUserId: u.sub, providerUsername: u.name || u.email || undefined };
  },
  validateTokenResponse: (tokens, config) => {
    if (tokens.id_token) {
      const sub = validateGoogleIdToken(tokens.id_token, config.clientId);
      return sub !== null;
    }
    return true;
  },
};

let cachedConfig: ProviderOAuthConfig | null = null;

export const readYoutubeOAuthConfig = (): ProviderOAuthConfig => {
  if (cachedConfig) return cachedConfig;
  const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.YOUTUBE_OAUTH_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'YouTube OAuth not configured: set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_OAUTH_REDIRECT_URI.',
    );
  }
  const scopesRaw = process.env.YOUTUBE_OAUTH_SCOPES?.trim();
  const scopes = scopesRaw
    ? scopesRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : [...DEFAULT_SCOPES];
  cachedConfig = { clientId, clientSecret, redirectUri, scopes };
  return cachedConfig;
};

export const clearYoutubeOAuthConfigCache = (): void => {
  cachedConfig = null;
};

export const beginLinkFlow = (userId: string): AuthorizeUrlResult =>
  beginFlow(YOUTUBE_SPEC, readYoutubeOAuthConfig(), userId);

export const completeLinkFlow = (
  params: { userId: string; code: string; state: string },
  deps: CompleteFlowDeps = {},
): Promise<CallbackOutcome> =>
  completeFlow(YOUTUBE_SPEC, readYoutubeOAuthConfig(), params, deps);

export const refreshLinkedAccount = (
  userId: string,
  deps: RefreshFlowDeps = {},
): Promise<RefreshOutcome> =>
  refreshFlow(YOUTUBE_SPEC, readYoutubeOAuthConfig(), userId, deps);
