import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db } from '../db/store';
import type { WidgetAlertTokenRecord } from '../db/types';

/**
 * Token management for browser-source overlay widgets (Phase 1 / Track A).
 *
 * Each token is a long-lived bearer credential the creator pastes into OBS's
 * "browser source" URL. We store only its SHA-256, so the plaintext is
 * shown to the creator exactly ONCE (at create time). Anyone holding a
 * leaked plaintext is on equal footing with the legitimate widget; if a
 * leak is suspected the creator revokes the token and creates a new one.
 *
 * The scopes array is reserved for future expansion (chat-relay,
 * overlay-control); v1 always issues `alerts:read`.
 */

const SECRET_BYTES = 32;
const DEFAULT_SCOPES = ['alerts:read'] as const;

const sha256Hex = (input: string): string =>
  createHash('sha256').update(input).digest('hex');

export interface CreateWidgetAlertTokenInput {
  blackoutUserId: string;
  label?: string;
  scopes?: readonly string[];
}

export interface CreatedWidgetAlertToken {
  /** The plaintext bearer secret. ONLY returned once, never persisted. */
  secret: string;
  record: WidgetAlertTokenRecord;
}

export const createWidgetAlertToken = (
  input: CreateWidgetAlertTokenInput,
): CreatedWidgetAlertToken => {
  const secret = randomBytes(SECRET_BYTES).toString('base64url');
  const secretHash = sha256Hex(secret);
  const record = db.createWidgetAlertToken({
    id: randomUUID(),
    blackoutUserId: input.blackoutUserId,
    label: input.label?.trim() || undefined,
    secretHash,
    scopes: [...(input.scopes ?? DEFAULT_SCOPES)],
  });
  return { secret, record };
};

/** Public-shape projection that NEVER includes the secret hash or plaintext. */
export interface WidgetAlertTokenSummary {
  id: string;
  label?: string;
  scopes: string[];
  createdAt: string;
  revokedAt?: string;
  revokedReason?: string;
  lastDeliveredAt?: string;
}

export const toSummary = (record: WidgetAlertTokenRecord): WidgetAlertTokenSummary => ({
  id: record.id,
  label: record.label,
  scopes: record.scopes,
  createdAt: record.createdAt,
  revokedAt: record.revokedAt,
  revokedReason: record.revokedReason,
  lastDeliveredAt: record.lastDeliveredAt,
});

export const listWidgetAlertTokens = (userId: string): WidgetAlertTokenSummary[] =>
  db.listWidgetAlertTokensForUser(userId).map(toSummary);

export type RevokeOutcome =
  | { kind: 'ok'; record: WidgetAlertTokenRecord }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'already_revoked' };

export const revokeWidgetAlertToken = (
  blackoutUserId: string,
  tokenId: string,
  reason = 'user_revoked',
): RevokeOutcome => {
  const existing = db.getWidgetAlertTokenById(tokenId);
  if (!existing) return { kind: 'not_found' };
  if (existing.blackoutUserId !== blackoutUserId) return { kind: 'forbidden' };
  if (existing.revokedAt) return { kind: 'already_revoked' };
  const updated = db.revokeWidgetAlertToken(tokenId, reason);
  if (!updated) return { kind: 'not_found' };
  return { kind: 'ok', record: updated };
};

/**
 * Verify a presented bearer secret. Returns the active token record or
 * null. Constant-time-ish: we always compute the hash, then look it up,
 * regardless of whether the secret is well-formed.
 */
export const verifyWidgetAlertSecret = (
  presentedSecret: string,
): WidgetAlertTokenRecord | null => {
  if (typeof presentedSecret !== 'string' || presentedSecret.length === 0) {
    return null;
  }
  const hash = sha256Hex(presentedSecret);
  return db.findActiveWidgetAlertTokenByHash(hash) ?? null;
};

/** Diagnostic: marks the token as just-delivered. */
export const recordWidgetDelivery = (record: WidgetAlertTokenRecord): void => {
  db.touchWidgetAlertTokenDelivered(record.secretHash);
};

export const __test__ = { sha256Hex };
