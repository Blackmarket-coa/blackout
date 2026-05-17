import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db } from '../db/store';
import type { EmailVerificationTokenRecord, UserRecord } from '../db/types';

const VERIFICATION_TOKEN_BYTES = 32;
const DEFAULT_TTL_SECONDS = 60 * 60 * 24; // 24h
const DEFAULT_RESEND_COOLDOWN_SECONDS = 60;

const sha256 = (input: string): string => createHash('sha256').update(input).digest('hex');

const ttlSeconds = (): number => {
  const fromEnv = Number.parseInt(process.env.EMAIL_VERIFICATION_TTL_SECONDS ?? '', 10);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_TTL_SECONDS;
};

const cooldownSeconds = (): number => {
  const fromEnv = Number.parseInt(process.env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS ?? '', 10);
  return Number.isFinite(fromEnv) && fromEnv >= 0 ? fromEnv : DEFAULT_RESEND_COOLDOWN_SECONDS;
};

const hashOptional = (value?: string): string | undefined => (value ? sha256(value) : undefined);

export interface IssueVerificationTokenInput {
  userId: string;
  email: string;
  ip?: string;
  userAgent?: string;
}

export type IssueOutcome =
  | { kind: 'ok'; token: string; record: EmailVerificationTokenRecord; user: UserRecord }
  | { kind: 'already_verified'; user: UserRecord }
  | { kind: 'user_missing' }
  | { kind: 'email_mismatch' }
  | { kind: 'cooldown'; retryAfterSeconds: number };

/**
 * Mints a fresh verification token for a user, revoking any outstanding
 * tokens to prevent stockpiling. A cooldown bounds how often a caller can
 * trigger this so a hostile loop cannot exhaust the upstream mail provider.
 */
export const issueEmailVerificationToken = (input: IssueVerificationTokenInput): IssueOutcome => {
  const user = db.getUserById(input.userId);
  if (!user) return { kind: 'user_missing' };
  if (user.emailVerifiedAt) return { kind: 'already_verified', user };
  if (user.email.toLowerCase() !== input.email.toLowerCase()) return { kind: 'email_mismatch' };

  const existing = db.listEmailVerificationTokensForUser(user.id);
  const cooldown = cooldownSeconds();
  if (cooldown > 0) {
    const mostRecentSent = existing
      .filter((t) => t.sentAt && !t.consumedAt && !t.revokedReason)
      .map((t) => Date.parse(t.sentAt as string))
      .filter((n) => Number.isFinite(n))
      .reduce((max, ts) => (ts > max ? ts : max), 0);
    if (mostRecentSent > 0) {
      const elapsedMs = Date.now() - mostRecentSent;
      const retryAfterSeconds = Math.ceil((cooldown * 1000 - elapsedMs) / 1000);
      if (retryAfterSeconds > 0) {
        return { kind: 'cooldown', retryAfterSeconds };
      }
    }
  }

  // Revoke any prior outstanding tokens so only the latest is consumable.
  db.revokeEmailVerificationTokensForUser(user.id, 'superseded');

  const token = randomBytes(VERIFICATION_TOKEN_BYTES).toString('base64url');
  const record = db.createEmailVerificationToken({
    id: randomUUID(),
    userId: user.id,
    email: user.email,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + ttlSeconds() * 1000).toISOString(),
    ipHash: hashOptional(input.ip),
    userAgentHash: hashOptional(input.userAgent),
  });
  return { kind: 'ok', token, record, user };
};

export const markVerificationTokenSent = (id: string): EmailVerificationTokenRecord | undefined =>
  db.markEmailVerificationTokenSent(id);

export type ConsumeOutcome =
  | { kind: 'ok'; user: UserRecord }
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'consumed' }
  | { kind: 'revoked' }
  | { kind: 'email_changed' };

/**
 * Redeems a verification token. The token is pinned to the email that was
 * current at issue time; if the user has since changed their email the
 * token is rejected so a stale link cannot validate a new address.
 */
export const consumeEmailVerificationToken = (presentedToken: string): ConsumeOutcome => {
  const record = db.findEmailVerificationTokenByHash(sha256(presentedToken));
  if (!record) return { kind: 'invalid' };
  if (record.consumedAt) return { kind: 'consumed' };
  if (record.revokedReason) return { kind: 'revoked' };
  if (new Date(record.expiresAt).getTime() <= Date.now()) return { kind: 'expired' };

  const user = db.getUserById(record.userId);
  if (!user) return { kind: 'invalid' };
  if (user.email.toLowerCase() !== record.email.toLowerCase()) return { kind: 'email_changed' };

  db.consumeEmailVerificationToken(record.id);
  const updated = db.markUserEmailVerified(user.id);
  if (!updated) return { kind: 'invalid' };
  return { kind: 'ok', user: updated };
};

export const __test__ = { sha256, ttlSeconds, cooldownSeconds };
