import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db } from '../db/store';
import type { EmailVerificationTokenRecord, UserRecord } from '../db/types';

const VERIFY_TOKEN_BYTES = 32;
const DEFAULT_TTL_SECONDS = 60 * 60 * 24; // 24 hours
const DEFAULT_THROTTLE_WINDOW_SECONDS = 60 * 15; // 15 minutes
const DEFAULT_THROTTLE_MAX = 5;

const sha256 = (input: string): string => createHash('sha256').update(input).digest('hex');

const numberFromEnv = (key: string, fallback: number): number => {
  const parsed = Number.parseInt(process.env[key] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const ttlSeconds = (): number => numberFromEnv('EMAIL_VERIFICATION_TTL_SECONDS', DEFAULT_TTL_SECONDS);
const throttleWindowSeconds = (): number =>
  numberFromEnv('EMAIL_VERIFICATION_THROTTLE_WINDOW_SECONDS', DEFAULT_THROTTLE_WINDOW_SECONDS);
const throttleMax = (): number => numberFromEnv('EMAIL_VERIFICATION_THROTTLE_MAX', DEFAULT_THROTTLE_MAX);

const hashOptional = (value?: string): string | undefined => (value ? sha256(value) : undefined);

export interface IssueEmailVerificationInput {
  userId: string;
  ip?: string;
  userAgent?: string;
}

export type IssueOutcome =
  | { kind: 'ok'; token: string; user: UserRecord; record: EmailVerificationTokenRecord }
  | { kind: 'unknown_user' }
  | { kind: 'already_verified' }
  | { kind: 'throttled' };

export const issueEmailVerificationToken = (input: IssueEmailVerificationInput): IssueOutcome => {
  const user = db.getUserById(input.userId);
  if (!user) return { kind: 'unknown_user' };
  if (user.emailVerifiedAt) return { kind: 'already_verified' };

  const since = new Date(Date.now() - throttleWindowSeconds() * 1000);
  const recent = db.countActiveEmailVerificationTokensForUser(user.id, since);
  if (recent >= throttleMax()) return { kind: 'throttled' };

  const token = randomBytes(VERIFY_TOKEN_BYTES).toString('base64url');
  const record = db.createEmailVerificationToken({
    id: randomUUID(),
    userId: user.id,
    email: user.email,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + ttlSeconds() * 1000).toISOString(),
    ipHash: hashOptional(input.ip),
    userAgentHash: hashOptional(input.userAgent),
  });
  return { kind: 'ok', token, user, record };
};

export type ConsumeOutcome =
  | { kind: 'ok'; user: UserRecord }
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'consumed' }
  | { kind: 'email_changed' };

export const consumeEmailVerificationToken = (presentedToken: string): ConsumeOutcome => {
  const record = db.findEmailVerificationTokenByHash(sha256(presentedToken));
  if (!record) return { kind: 'invalid' };
  if (record.consumedAt) return { kind: 'consumed' };
  if (new Date(record.expiresAt).getTime() <= Date.now()) return { kind: 'expired' };

  const user = db.getUserById(record.userId);
  if (!user) return { kind: 'invalid' };

  // If the address on the user record no longer matches the address the token
  // was issued for, refuse — a stale token must not promote a different email.
  if (user.email.toLowerCase() !== record.email.toLowerCase()) {
    return { kind: 'email_changed' };
  }

  const updated = db.markUserEmailVerified(user.id);
  if (!updated) return { kind: 'invalid' };
  db.consumeEmailVerificationToken(record.id);
  return { kind: 'ok', user: updated };
};

export const __test__ = { sha256 };
