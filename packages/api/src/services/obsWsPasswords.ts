import { randomBytes, randomUUID } from 'node:crypto';
import { db } from '../db/store';
import type { ObsWsPasswordRecord } from '../db/types';
import { decryptSecret, encryptSecret, envelopeKeyId } from './secretBox';

/**
 * Phase 3 / Track B: OBS-WebSocket v5-compatible server passwords.
 *
 * Each row is one connection slot — the creator pastes the plaintext
 * password into Stream Deck / Touch Portal / Companion / etc., and
 * points the surface at `wss://<api-host>/obs-ws/<row-id>`. The id is
 * the public part of the URL; revocation flips `is_active` so a stolen
 * password (or a sold device) can be cut without touching siblings.
 *
 * Plaintext is AES-256-GCM-encrypted at rest with services/secretBox,
 * AAD-bound to the row id so a leaked envelope can't be replayed
 * against a different password row. Standard pattern; matches outbound
 * webhook signing secrets.
 */

const PASSWORD_BYTES = 24;
const LABEL_MAX = 80;

const aadFor = (passwordId: string): string => `obs_ws_password|${passwordId}`;

export interface MintInput {
  blackoutUserId: string;
  label?: string;
}

export type MintOutcome =
  | {
      kind: 'ok';
      record: ObsWsPasswordRecord;
      /** Plaintext password. Returned only at mint time. */
      password: string;
    }
  | { kind: 'invalid_input'; reason: string };

const validateMint = (
  input: MintInput,
): { ok: true } | { ok: false; reason: string } => {
  if (!input.blackoutUserId) return { ok: false, reason: 'blackoutUserId is required' };
  if (input.label && input.label.length > LABEL_MAX) {
    return { ok: false, reason: `label must be ≤ ${LABEL_MAX} chars` };
  }
  return { ok: true };
};

export const mint = (input: MintInput): MintOutcome => {
  const valid = validateMint(input);
  if (!valid.ok) return { kind: 'invalid_input', reason: valid.reason };
  const password = randomBytes(PASSWORD_BYTES).toString('base64url');
  const id = randomUUID();
  const ciphertext = encryptSecret(password, { aad: aadFor(id) });
  const record = db.createObsWsPassword({
    id,
    blackoutUserId: input.blackoutUserId,
    label: input.label?.trim() || undefined,
    passwordCiphertext: ciphertext,
    encryptionKeyId: envelopeKeyId(ciphertext),
    isActive: true,
    useCount: 0,
  });
  return { kind: 'ok', record, password };
};

/** Public-shape projection that NEVER includes the ciphertext or plaintext. */
export const projectRecord = (record: ObsWsPasswordRecord) => ({
  id: record.id,
  label: record.label,
  isActive: record.isActive,
  revokedAt: record.revokedAt,
  revokeReason: record.revokeReason,
  lastUsedAt: record.lastUsedAt,
  useCount: record.useCount,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

export const listForUser = (userId: string): ObsWsPasswordRecord[] =>
  db.listObsWsPasswordsForUser(userId);

export type RevokeOutcome =
  | { kind: 'ok'; record: ObsWsPasswordRecord }
  | { kind: 'not_found' }
  | { kind: 'forbidden' };

export const revoke = (
  blackoutUserId: string,
  passwordId: string,
  reason = 'user_revoked',
): RevokeOutcome => {
  const existing = db.getObsWsPassword(passwordId);
  if (!existing) return { kind: 'not_found' };
  if (existing.blackoutUserId !== blackoutUserId) return { kind: 'forbidden' };
  const updated = db.revokeObsWsPassword(passwordId, reason);
  return updated ? { kind: 'ok', record: updated } : { kind: 'not_found' };
};

/**
 * Decrypt the at-rest plaintext for a specific row. Used by the OBS-WS
 * shim's auth handler to compute the expected challenge/response. The
 * plaintext lives in memory only as long as the auth dance takes.
 */
export const decryptPasswordFor = (record: ObsWsPasswordRecord): string =>
  decryptSecret(record.passwordCiphertext, { aad: aadFor(record.id) });

export const noteUsed = (id: string): void => {
  db.touchObsWsPasswordUsed(id);
};

export const __test__ = { aadFor };
