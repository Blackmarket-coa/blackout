import { randomUUID } from 'node:crypto';
import { db } from '../db/store';
import type { LinkedAccountProvider, LinkedAccountRecord } from '../db/types';
import { decryptSecret, encryptSecret, envelopeKeyId, readSecretBoxConfig } from './secretBox';

/** Providers we know how to OAuth-link. Mirrors the SQL CHECK / column. */
export const LINKED_ACCOUNT_PROVIDERS: readonly LinkedAccountProvider[] = [
  'twitch',
  'youtube',
  'discord',
  'patreon',
  'tiktok',
  'kick',
  'streamlabs',
] as const;

export const isLinkedAccountProvider = (value: unknown): value is LinkedAccountProvider =>
  typeof value === 'string' && (LINKED_ACCOUNT_PROVIDERS as readonly string[]).includes(value);

/**
 * The tokens we've just received from a provider's token endpoint, before
 * we've encrypted them for at-rest storage.
 */
export interface PlaintextProviderTokens {
  accessToken: string;
  refreshToken?: string;
  /** Seconds until the access token expires, as returned by the provider. */
  expiresInSeconds?: number;
  scopes: string[];
}

export interface LinkedAccountSummary {
  id: string;
  provider: LinkedAccountProvider;
  providerUserId: string;
  providerUsername?: string;
  scopes: string[];
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

const aadFor = (userId: string, provider: LinkedAccountProvider): string =>
  `linked_account:${provider}:${userId}`;

/** Public-shape projection that never includes the encrypted token envelopes. */
export const toLinkedAccountSummary = (record: LinkedAccountRecord): LinkedAccountSummary => ({
  id: record.id,
  provider: record.provider,
  providerUserId: record.providerUserId,
  providerUsername: record.providerUsername,
  scopes: record.scopes,
  expiresAt: record.expiresAt,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

export interface UpsertLinkedAccountInput {
  blackoutUserId: string;
  provider: LinkedAccountProvider;
  providerUserId: string;
  providerUsername?: string;
  tokens: PlaintextProviderTokens;
}

/** Encrypt tokens at rest and upsert. Replaces any existing link for (user, provider). */
export const upsertLinkedAccount = (input: UpsertLinkedAccountInput): LinkedAccountRecord => {
  const aad = aadFor(input.blackoutUserId, input.provider);
  const accessTokenCiphertext = encryptSecret(input.tokens.accessToken, { aad });
  const refreshTokenCiphertext = input.tokens.refreshToken
    ? encryptSecret(input.tokens.refreshToken, { aad })
    : undefined;
  const expiresAt =
    typeof input.tokens.expiresInSeconds === 'number' && input.tokens.expiresInSeconds > 0
      ? new Date(Date.now() + input.tokens.expiresInSeconds * 1000).toISOString()
      : undefined;

  const existing = db.getLinkedAccount(input.blackoutUserId, input.provider);
  return db.upsertLinkedAccount({
    id: existing?.id ?? randomUUID(),
    blackoutUserId: input.blackoutUserId,
    provider: input.provider,
    providerUserId: input.providerUserId,
    providerUsername: input.providerUsername,
    accessTokenCiphertext,
    refreshTokenCiphertext,
    scopes: input.tokens.scopes,
    expiresAt,
    encryptionKeyId: envelopeKeyId(accessTokenCiphertext),
  });
};

export const listLinkedAccounts = (userId: string): LinkedAccountSummary[] =>
  db.listLinkedAccountsForUser(userId).map(toLinkedAccountSummary);

export const getLinkedAccount = (
  userId: string,
  provider: LinkedAccountProvider,
): LinkedAccountSummary | null => {
  const record = db.getLinkedAccount(userId, provider);
  return record ? toLinkedAccountSummary(record) : null;
};

export interface DecryptedLinkedAccount {
  record: LinkedAccountRecord;
  accessToken: string;
  refreshToken?: string;
}

/**
 * Server-internal accessor: returns plaintext tokens. Never expose the result
 * to a route response — only pass into outbound HTTP clients (Twitch Helix,
 * Discord REST, etc.).
 */
export const decryptLinkedAccount = (
  userId: string,
  provider: LinkedAccountProvider,
): DecryptedLinkedAccount | null => {
  const record = db.getLinkedAccount(userId, provider);
  if (!record) return null;
  const aad = aadFor(record.blackoutUserId, record.provider);
  const accessToken = decryptSecret(record.accessTokenCiphertext, { aad });
  const refreshToken = record.refreshTokenCiphertext
    ? decryptSecret(record.refreshTokenCiphertext, { aad })
    : undefined;
  return { record, accessToken, refreshToken };
};

export const unlinkAccount = (userId: string, provider: LinkedAccountProvider): boolean =>
  db.deleteLinkedAccount(userId, provider);

/** Throws early at boot if the encryption-keys env is missing or malformed. */
export const assertSecretBoxConfigured = (): void => {
  readSecretBoxConfig();
};
