import { createHash, randomBytes } from 'node:crypto';
import { db } from '../../db/store';
import {
  decryptSecret,
  encryptSecret,
  envelopeKeyId,
  readSecretBoxConfig,
} from '../../services/secretBox';
import { upsertLinkedAccount } from '../../services/linkedAccounts';
import type { LinkedAccountProvider, LinkedAccountRecord } from '../../db/types';

/**
 * Generic OAuth2 authorization-code + PKCE (S256) flow shared by every
 * third-party identity provider Blackout links to (Twitch, Discord, Patreon,
 * YouTube, etc.). Each provider supplies a {@link ProviderSpec} describing
 * the URLs and the identity-response shape; this file owns the rest:
 *
 *   - PKCE verifier/challenge + state generation
 *   - Encrypted, single-use pending-link persistence (10-min TTL)
 *   - Form-encoded token exchange against the provider's token endpoint
 *   - Identity lookup with bearer auth + provider-specific extra headers
 *   - Upsert into linked_accounts via the encrypted-token service
 *
 * Adding a new provider should be a ~30-line file: read its env-driven
 * config, declare a ProviderSpec, and re-export thin wrappers around
 * beginFlow / completeFlow.
 */

const PENDING_TTL_SECONDS = 10 * 60;
const STATE_BYTES = 32;
const VERIFIER_BYTES = 64;

export interface ProviderOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface NormalizedIdentity {
  providerUserId: string;
  providerUsername?: string;
}

export interface ProviderSpec {
  provider: LinkedAccountProvider;
  authorizeUrl: string;
  tokenUrl: string;
  /** Full URL (including any provider-specific query params) for the identity GET. */
  identityUrl: string;
  /** Joiner used between scopes in the authorize-URL `scope` param. Default `' '`. */
  scopeSeparator?: string;
  /** Extra query params merged into the authorize URL (e.g. Twitch `force_verify=true`). */
  extraAuthorizeParams?: Record<string, string>;
  /** Headers added to the identity GET beyond the bearer token (e.g. Twitch `Client-Id`). */
  identityExtraHeaders?: (config: ProviderOAuthConfig) => Record<string, string>;
  /** Parse the provider's identity JSON into our normalized shape; return null on miss. */
  parseIdentity: (json: unknown) => NormalizedIdentity | null;
}

export interface AuthorizeUrlResult {
  authorizeUrl: string;
  state: string;
  expiresAt: string;
}

export type CallbackOutcome =
  | { kind: 'ok'; record: LinkedAccountRecord }
  | { kind: 'state_invalid' }
  | { kind: 'state_expired' }
  | { kind: 'state_mismatch' }
  | { kind: 'token_exchange_failed'; status: number; detail: string }
  | { kind: 'identity_lookup_failed'; status: number; detail: string };

export interface CompleteFlowDeps {
  fetch?: typeof fetch;
}

interface ProviderTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string[] | string;
  token_type?: string;
}

const sha256Hex = (input: string): string => createHash('sha256').update(input).digest('hex');
const b64url = (input: Buffer): string => input.toString('base64url');
const codeChallengeS256 = (verifier: string): string =>
  b64url(createHash('sha256').update(verifier).digest());

const aadForPending = (provider: LinkedAccountProvider, stateHash: string): string =>
  `pending_oauth_link:${provider}:${stateHash}`;

const parseScopes = (scope: ProviderTokenResponse['scope'], separator = ' '): string[] => {
  if (!scope) return [];
  if (Array.isArray(scope)) return scope;
  // Handle either ' ' or ',' regardless of negotiated separator: providers
  // are inconsistent (Twitch sometimes returns array, Discord returns
  // space-separated, Patreon returns space-separated).
  if (separator === ',') return scope.split(',').map((s) => s.trim()).filter(Boolean);
  return scope.split(' ').map((s) => s.trim()).filter(Boolean);
};

/** Begin the OAuth link flow. Persists encrypted pending state + returns the authorize URL. */
export const beginFlow = (
  spec: ProviderSpec,
  config: ProviderOAuthConfig,
  userId: string,
): AuthorizeUrlResult => {
  // Surface bad config early — otherwise we'd persist a pending row that can
  // never complete.
  readSecretBoxConfig();

  const state = b64url(randomBytes(STATE_BYTES));
  const verifier = b64url(randomBytes(VERIFIER_BYTES));
  const challenge = codeChallengeS256(verifier);
  const stateHash = sha256Hex(state);

  const codeVerifierCiphertext = encryptSecret(verifier, {
    aad: aadForPending(spec.provider, stateHash),
  });
  const expiresAt = new Date(Date.now() + PENDING_TTL_SECONDS * 1000).toISOString();

  db.createPendingOAuthLink({
    stateHash,
    blackoutUserId: userId,
    provider: spec.provider,
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
    scope: config.scopes.join(spec.scopeSeparator ?? ' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...(spec.extraAuthorizeParams ?? {}),
  });

  return {
    authorizeUrl: `${spec.authorizeUrl}?${params.toString()}`,
    state,
    expiresAt,
  };
};

/**
 * Complete the OAuth flow with the `code` and `state` returned via the
 * provider's redirect. Validates state ownership + freshness, exchanges the
 * code, fetches identity, and upserts the encrypted link.
 */
export const completeFlow = async (
  spec: ProviderSpec,
  config: ProviderOAuthConfig,
  params: { userId: string; code: string; state: string },
  deps: CompleteFlowDeps = {},
): Promise<CallbackOutcome> => {
  const fetchFn = deps.fetch ?? fetch;
  const stateHash = sha256Hex(params.state);
  const pending = db.consumePendingOAuthLink(stateHash);
  if (!pending) return { kind: 'state_invalid' };
  if (pending.provider !== spec.provider) return { kind: 'state_mismatch' };
  if (pending.blackoutUserId !== params.userId) return { kind: 'state_mismatch' };

  let verifier: string;
  try {
    verifier = decryptSecret(pending.codeVerifierCiphertext, {
      aad: aadForPending(spec.provider, stateHash),
    });
  } catch {
    return { kind: 'state_invalid' };
  }

  // ---- token exchange ----
  const tokenBody = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: params.code,
    grant_type: 'authorization_code',
    redirect_uri: pending.redirectUri,
    code_verifier: verifier,
  });
  const tokenRes = await fetchFn(spec.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: tokenBody.toString(),
  });
  if (!tokenRes.ok) {
    const detail = await tokenRes.text().catch(() => '');
    return { kind: 'token_exchange_failed', status: tokenRes.status, detail };
  }
  const tokenJson = (await tokenRes.json()) as ProviderTokenResponse;
  if (!tokenJson.access_token) {
    return { kind: 'token_exchange_failed', status: tokenRes.status, detail: 'missing access_token' };
  }

  // ---- identity lookup ----
  const idRes = await fetchFn(spec.identityUrl, {
    headers: {
      authorization: `Bearer ${tokenJson.access_token}`,
      ...(spec.identityExtraHeaders?.(config) ?? {}),
    },
  });
  if (!idRes.ok) {
    const detail = await idRes.text().catch(() => '');
    return { kind: 'identity_lookup_failed', status: idRes.status, detail };
  }
  const idJson = (await idRes.json()) as unknown;
  const normalized = spec.parseIdentity(idJson);
  if (!normalized) {
    return { kind: 'identity_lookup_failed', status: idRes.status, detail: 'identity parse returned null' };
  }

  const record = upsertLinkedAccount({
    blackoutUserId: params.userId,
    provider: spec.provider,
    providerUserId: normalized.providerUserId,
    providerUsername: normalized.providerUsername,
    tokens: {
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token,
      expiresInSeconds: tokenJson.expires_in,
      scopes: parseScopes(tokenJson.scope, spec.scopeSeparator),
    },
  });

  return { kind: 'ok', record };
};

export const __test__ = { sha256Hex, codeChallengeS256, aadForPending };
