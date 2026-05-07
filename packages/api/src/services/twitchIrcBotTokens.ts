import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db } from '../db/store';
import type { TwitchIrcBotTokenRecord } from '../db/types';

/**
 * Phase 2 / Track B: Twitch-IRC-compatible bot tokens.
 *
 * Mints a bearer secret a creator pastes into an external Twitch chat
 * bot's "OAuth Token" field. The bot connects to Blackout's future IRC
 * shim with `PASS oauth:<plaintext>` (Twitch convention); we sha256 the
 * presented secret and look up the matching {@link TwitchIrcBotTokenRecord}.
 *
 * No encryption-at-rest — these are bearer secrets like the widget alert
 * tokens, not signing material that needs to survive a leak. A creator
 * who lost the plaintext just revokes and re-mints.
 */

const SECRET_BYTES = 32;
const LABEL_MAX = 80;

const sha256Hex = (s: string): string =>
  createHash('sha256').update(s).digest('hex');

export interface MintInput {
  blackoutUserId: string;
  label?: string;
  /** Channel scope. Empty array = "all channels owned by this creator". */
  scopes?: string[];
}

export type MintOutcome =
  | {
      kind: 'ok';
      record: TwitchIrcBotTokenRecord;
      /** Plaintext bearer. Returned only at mint time. */
      secret: string;
    }
  | { kind: 'invalid_input'; reason: string };

const validateMint = (
  input: MintInput,
): { ok: true } | { ok: false; reason: string } => {
  if (!input.blackoutUserId) return { ok: false, reason: 'blackoutUserId is required' };
  if (input.label && input.label.length > LABEL_MAX) {
    return { ok: false, reason: `label must be ≤ ${LABEL_MAX} chars` };
  }
  if (input.scopes) {
    for (const s of input.scopes) {
      if (typeof s !== 'string' || !s.trim()) {
        return { ok: false, reason: 'scopes entries must be non-empty strings' };
      }
    }
  }
  return { ok: true };
};

export const mint = (input: MintInput): MintOutcome => {
  const valid = validateMint(input);
  if (!valid.ok) return { kind: 'invalid_input', reason: valid.reason };
  const secret = randomBytes(SECRET_BYTES).toString('base64url');
  const record = db.createTwitchIrcBotToken({
    id: randomUUID(),
    blackoutUserId: input.blackoutUserId,
    label: input.label?.trim() || undefined,
    secretHash: sha256Hex(secret),
    scopes: [...new Set(input.scopes ?? [])],
    isActive: true,
    useCount: 0,
  });
  return { kind: 'ok', record, secret };
};

/** Public-shape projection that NEVER includes the hash or plaintext. */
export const projectRecord = (record: TwitchIrcBotTokenRecord) => ({
  id: record.id,
  label: record.label,
  scopes: record.scopes,
  isActive: record.isActive,
  revokedAt: record.revokedAt,
  revokeReason: record.revokeReason,
  lastUsedAt: record.lastUsedAt,
  useCount: record.useCount,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

export const listForUser = (userId: string): TwitchIrcBotTokenRecord[] =>
  db.listTwitchIrcBotTokensForUser(userId);

export type RevokeOutcome =
  | { kind: 'ok'; record: TwitchIrcBotTokenRecord }
  | { kind: 'not_found' }
  | { kind: 'forbidden' };

export const revoke = (
  blackoutUserId: string,
  tokenId: string,
  reason = 'user_revoked',
): RevokeOutcome => {
  const existing = db.getTwitchIrcBotToken(tokenId);
  if (!existing) return { kind: 'not_found' };
  if (existing.blackoutUserId !== blackoutUserId) return { kind: 'forbidden' };
  const updated = db.revokeTwitchIrcBotToken(tokenId, reason);
  return updated ? { kind: 'ok', record: updated } : { kind: 'not_found' };
};

/**
 * Verify a presented bearer (the plaintext after the `oauth:` prefix in a
 * Twitch IRC `PASS` line). Returns the active record on success or null.
 *
 * Constant-time-ish: we always compute the hash before looking up, so
 * malformed inputs don't get faster.
 */
export const verifyBearer = (
  presentedSecret: string,
): TwitchIrcBotTokenRecord | null => {
  if (typeof presentedSecret !== 'string' || presentedSecret.length === 0) {
    return null;
  }
  const hash = sha256Hex(presentedSecret);
  return db.findActiveTwitchIrcBotTokenByHash(hash) ?? null;
};

export const noteUsed = (id: string): void => {
  db.touchTwitchIrcBotTokenUsed(id);
};

export const __test__ = { sha256Hex };
