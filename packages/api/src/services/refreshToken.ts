import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db } from '../db/store';
import type { RefreshTokenRecord } from '../db/types';

const REFRESH_TOKEN_BYTES = 48;
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const sha256 = (input: string): string => createHash('sha256').update(input).digest('hex');

const ttlSeconds = (): number => {
  const fromEnv = Number.parseInt(process.env.REFRESH_TOKEN_TTL_SECONDS ?? '', 10);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_TTL_SECONDS;
};

export interface IssuedRefreshToken {
  token: string;
  record: RefreshTokenRecord;
}

export interface RotateOptions {
  userId: string;
  /** Existing family id when rotating; omit to start a new family at login. */
  familyId?: string;
  userAgent?: string;
}

const userAgentHash = (userAgent?: string): string | undefined =>
  userAgent ? sha256(userAgent) : undefined;

export const issueRefreshToken = (options: RotateOptions): IssuedRefreshToken => {
  const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  const id = randomUUID();
  const familyId = options.familyId ?? randomUUID();
  const expiresAt = new Date(Date.now() + ttlSeconds() * 1000).toISOString();
  const record = db.createRefreshToken({
    id,
    userId: options.userId,
    familyId,
    tokenHash: sha256(token),
    expiresAt,
    userAgentHash: userAgentHash(options.userAgent),
  });
  return { token, record };
};

export type RefreshOutcome =
  | { kind: 'ok'; record: RefreshTokenRecord; rotated: IssuedRefreshToken }
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'revoked' }
  | { kind: 'reuse_detected'; userId: string; familyId: string };

export const rotateRefreshToken = (presentedToken: string, userAgent?: string): RefreshOutcome => {
  const tokenHash = sha256(presentedToken);
  const existing = db.findRefreshTokenByHash(tokenHash);
  if (!existing) return { kind: 'invalid' };

  // If this token was already replaced (rotated) and someone presents it again,
  // that's a reuse signal. Burn the entire family — both replicas of the
  // attacker's flow and the legitimate user's flow get logged out, but the
  // attacker is forced to reauthenticate before they can re-establish a
  // session.
  if (existing.replacedBy) {
    db.revokeRefreshTokenFamily(existing.familyId, 'reuse_detected');
    return { kind: 'reuse_detected', userId: existing.userId, familyId: existing.familyId };
  }
  if (existing.revokedAt) return { kind: 'revoked' };
  if (new Date(existing.expiresAt).getTime() <= Date.now()) return { kind: 'expired' };

  const rotated = issueRefreshToken({ userId: existing.userId, familyId: existing.familyId, userAgent });
  db.markRefreshTokenReplaced(existing.id, rotated.record.id);
  return { kind: 'ok', record: existing, rotated };
};

export const revokeRefreshToken = (presentedToken: string, reason = 'logout'): boolean => {
  const tokenHash = sha256(presentedToken);
  const existing = db.findRefreshTokenByHash(tokenHash);
  if (!existing || existing.revokedAt) return false;
  db.revokeRefreshTokenFamily(existing.familyId, reason);
  return true;
};

export const revokeAllForUser = (userId: string, reason = 'admin_revoke'): number =>
  db.revokeRefreshTokensForUser(userId, reason);

export const __test__ = { sha256 };
