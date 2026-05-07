import { createHash, randomBytes } from 'node:crypto';
import { db } from '../../db/store';
import {
  decryptSecret,
  encryptSecret,
  envelopeKeyId,
  readSecretBoxConfig,
} from '../../services/secretBox';
import { upsertLinkedAccount } from '../../services/linkedAccounts';
import type { LinkedAccountRecord } from '../../db/types';

/**
 * Twitch OAuth2 authorization-code flow with PKCE (S256).
 *
 * Spec: https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/
 * Authorize: https://id.twitch.tv/oauth2/authorize
 * Token:     https://id.twitch.tv/oauth2/token
 * Identity:  https://api.twitch.tv/helix/users
 *
 * Configuration (env):
 *   TWITCH_CLIENT_ID         — required
 *   TWITCH_CLIENT_SECRET     — required
 *   TWITCH_OAUTH_REDIRECT_URI — required (must exactly match what's
 *                              registered in the Twitch Developer Console)
 *   TWITCH_OAUTH_SCOPES      — optional, comma-separated, defaults below
 */

const DEFAULT_SCOPES = ['user:read:email', 'channel:read:subscriptions'];
const PENDING_TTL_SECONDS = 10 * 60; // 10 minutes
const STATE_BYTES = 32;
const VERIFIER_BYTES = 64;

const TWITCH_AUTHORIZE_URL = 'https://id.twitch.tv/oauth2/authorize';
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const TWITCH_USERS_URL = 'https://api.twitch.tv/helix/users';

export interface TwitchOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

let cachedConfig: TwitchOAuthConfig | null = null;

export const readTwitchOAuthConfig = (): TwitchOAuthConfig => {
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

const sha256Hex = (input: string): string => createHash('sha256').update(input).digest('hex');
const b64url = (input: Buffer): string => input.toString('base64url');

/** PKCE S256 challenge. */
const codeChallengeS256 = (verifier: string): string =>
  b64url(createHash('sha256').update(verifier).digest());

export interface AuthorizeUrlResult {
  /** Where to send the user's browser. */
  authorizeUrl: string;
  /** Plaintext state token; must be matched on callback. */
  state: string;
  expiresAt: string;
}

const aadForPending = (stateHash: string): string => `pending_oauth_link:twitch:${stateHash}`;

/**
 * Begin the OAuth link flow for `userId`. Stores a pending link record with an
 * encrypted PKCE verifier and returns the authorize URL plus the random state
 * (which must round-trip via the redirect query string).
 */
export const beginLinkFlow = (userId: string): AuthorizeUrlResult => {
  // Surface bad config early (otherwise we'd persist a pending link that can
  // never complete).
  readSecretBoxConfig();
  const config = readTwitchOAuthConfig();

  const state = b64url(randomBytes(STATE_BYTES));
  const verifier = b64url(randomBytes(VERIFIER_BYTES));
  const challenge = codeChallengeS256(verifier);
  const stateHash = sha256Hex(state);

  const codeVerifierCiphertext = encryptSecret(verifier, { aad: aadForPending(stateHash) });
  const expiresAt = new Date(Date.now() + PENDING_TTL_SECONDS * 1000).toISOString();

  db.createPendingOAuthLink({
    stateHash,
    blackoutUserId: userId,
    provider: 'twitch',
    codeVerifierCiphertext,
    redirectUri: config.redirectUri,
    scopes: config.scopes,
    encryptionKeyId: envelopeKeyId(codeVerifierCiphertext),
    expiresAt,
  });

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    force_verify: 'true',
  });

  return {
    authorizeUrl: `${TWITCH_AUTHORIZE_URL}?${params.toString()}`,
    state,
    expiresAt,
  };
};

export type CallbackOutcome =
  | { kind: 'ok'; record: LinkedAccountRecord }
  | { kind: 'state_invalid' }
  | { kind: 'state_expired' }
  | { kind: 'state_mismatch' }
  | { kind: 'token_exchange_failed'; status: number; detail: string }
  | { kind: 'identity_lookup_failed'; status: number; detail: string };

interface TwitchTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string[] | string;
  token_type?: string;
}

interface TwitchUsersResponse {
  data: Array<{ id: string; login: string; display_name: string }>;
}

const parseScopes = (scope: TwitchTokenResponse['scope']): string[] => {
  if (!scope) return [];
  return Array.isArray(scope) ? scope : scope.split(' ').filter(Boolean);
};

/** Pluggable for tests; defaults to global fetch. */
export interface CompleteLinkFlowDeps {
  fetch?: typeof fetch;
}

/**
 * Complete the OAuth flow with the `code` and `state` returned via the
 * Twitch redirect. Validates state, exchanges the code at Twitch's token
 * endpoint, fetches the linked Twitch user identity, and upserts the
 * `linked_accounts` row.
 *
 * Pass `deps.fetch` to inject a stub in tests; defaults to global fetch.
 */
export const completeLinkFlow = async (
  params: { userId: string; code: string; state: string },
  deps: CompleteLinkFlowDeps = {},
): Promise<CallbackOutcome> => {
  const config = readTwitchOAuthConfig();
  const fetchFn = deps.fetch ?? fetch;

  const stateHash = sha256Hex(params.state);
  const pending = db.consumePendingOAuthLink(stateHash);
  if (!pending) return { kind: 'state_invalid' };
  if (pending.provider !== 'twitch') return { kind: 'state_mismatch' };
  if (pending.blackoutUserId !== params.userId) return { kind: 'state_mismatch' };

  let verifier: string;
  try {
    verifier = decryptSecret(pending.codeVerifierCiphertext, {
      aad: aadForPending(stateHash),
    });
  } catch {
    // Either tampered ciphertext or unknown encryption keyId — treat as
    // a hard rejection rather than leaking which.
    return { kind: 'state_invalid' };
  }

  // --- exchange the code at Twitch's token endpoint ---
  const tokenBody = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: params.code,
    grant_type: 'authorization_code',
    redirect_uri: pending.redirectUri,
    code_verifier: verifier,
  });
  const tokenRes = await fetchFn(TWITCH_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: tokenBody.toString(),
  });
  if (!tokenRes.ok) {
    const detail = await tokenRes.text().catch(() => '');
    return { kind: 'token_exchange_failed', status: tokenRes.status, detail };
  }
  const tokenJson = (await tokenRes.json()) as TwitchTokenResponse;
  if (!tokenJson.access_token) {
    return { kind: 'token_exchange_failed', status: tokenRes.status, detail: 'missing access_token' };
  }

  // --- fetch the linked Twitch identity ---
  const idRes = await fetchFn(TWITCH_USERS_URL, {
    headers: {
      'authorization': `Bearer ${tokenJson.access_token}`,
      'client-id': config.clientId,
    },
  });
  if (!idRes.ok) {
    const detail = await idRes.text().catch(() => '');
    return { kind: 'identity_lookup_failed', status: idRes.status, detail };
  }
  const idJson = (await idRes.json()) as TwitchUsersResponse;
  const me = idJson.data?.[0];
  if (!me) {
    return { kind: 'identity_lookup_failed', status: idRes.status, detail: 'empty data array' };
  }

  const record = upsertLinkedAccount({
    blackoutUserId: params.userId,
    provider: 'twitch',
    providerUserId: me.id,
    providerUsername: me.display_name || me.login,
    tokens: {
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token,
      expiresInSeconds: tokenJson.expires_in,
      scopes: parseScopes(tokenJson.scope),
    },
  });

  return { kind: 'ok', record };
};

export const __test__ = { sha256Hex, codeChallengeS256, aadForPending };
