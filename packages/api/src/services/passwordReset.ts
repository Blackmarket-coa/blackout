/**
 * WHAT THIS FILE DOES
 * Password reset flow — issues time-limited tokens (sent via email) and
 * consumes them to set a new password. Tokens are SHA-256 hashed before
 * storage (plaintext only exists in transit via email).
 *
 * WHAT WAS WRONG (MISSING BREACH CHECK)
 * The reset flow checked password strength (length, character classes)
 * but never called `isBreachedPassword`. A user resetting to a breached
 * password would succeed here but fail during normal password change —
 * an inconsistent security boundary. Now calls both checks in sequence.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db } from '../db/store';
import type { PasswordResetTokenRecord, UserRecord } from '../db/types';
import { hashPassword, isAcceptablePassword, isBreachedPassword } from './auth';
import { revokeAllForUser } from './refreshToken';

const RESET_TOKEN_BYTES = 32;
const DEFAULT_TTL_SECONDS = 60 * 30; // 30 minutes

const sha256 = (input: string): string => createHash('sha256').update(input).digest('hex');

const ttlSeconds = (): number => {
  const fromEnv = Number.parseInt(process.env.RESET_TOKEN_TTL_SECONDS ?? '', 10);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_TTL_SECONDS;
};

export interface IssueResetTokenInput {
  email: string;
  ip?: string;
  userAgent?: string;
}

export interface IssuedResetToken {
  /** Plaintext token returned to the caller — pass to mailer, then discard. */
  token: string;
  user: UserRecord;
  record: PasswordResetTokenRecord;
}

const hashOptional = (value?: string): string | undefined => (value ? sha256(value) : undefined);

export const issuePasswordResetToken = (input: IssueResetTokenInput): IssuedResetToken | null => {
  const user = db.findUserByEmail(input.email);
  if (!user) return null;

  const token = randomBytes(RESET_TOKEN_BYTES).toString('base64url');
  const record = db.createPasswordResetToken({
    id: randomUUID(),
    userId: user.id,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + ttlSeconds() * 1000).toISOString(),
    ipHash: hashOptional(input.ip),
    userAgentHash: hashOptional(input.userAgent),
  });
  return { token, user, record };
};

export type ConsumeOutcome =
  | { kind: 'ok'; user: UserRecord }
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'consumed' }
  | { kind: 'weak_password' }
  | { kind: 'breached_password' };

export const consumePasswordResetToken = async (presentedToken: string, newPassword: string): Promise<ConsumeOutcome> => {
  const record = db.findPasswordResetTokenByHash(sha256(presentedToken));
  if (!record) return { kind: 'invalid' };
  if (record.consumedAt) return { kind: 'consumed' };
  if (new Date(record.expiresAt).getTime() <= Date.now()) return { kind: 'expired' };
  if (!isAcceptablePassword(newPassword)) return { kind: 'weak_password' };
  if (await isBreachedPassword(newPassword)) return { kind: 'breached_password' };

  const user = db.getUserById(record.userId);
  if (!user) return { kind: 'invalid' };

  const passwordHash = await hashPassword(newPassword);
  const updated = db.updateUserPassword(user.id, passwordHash);
  if (!updated) return { kind: 'invalid' };

  db.consumePasswordResetToken(record.id);
  // A password reset is also a logout-everywhere event: invalidate every
  // outstanding refresh token for this user so a stolen credential cannot
  // continue to mint sessions.
  revokeAllForUser(user.id, 'password_reset');
  return { kind: 'ok', user: updated };
};

export const __test__ = { sha256 };
