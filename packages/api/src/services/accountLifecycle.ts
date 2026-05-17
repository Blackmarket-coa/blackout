import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db } from '../db/store';
import type { UserRecord } from '../db/types';

const DELETE_TOKEN_BYTES = 32;
const DEFAULT_DELETE_TTL_SECONDS = 60 * 30; // 30 minutes

const sha256 = (input: string): string => createHash('sha256').update(input).digest('hex');

const numberFromEnv = (key: string, fallback: number): number => {
  const parsed = Number.parseInt(process.env[key] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const ttlSeconds = (): number =>
  numberFromEnv('ACCOUNT_DELETE_TOKEN_TTL_SECONDS', DEFAULT_DELETE_TTL_SECONDS);

const hashOptional = (value?: string): string | undefined => (value ? sha256(value) : undefined);

/**
 * GDPR / DSAR-style data export. Returns every record we hold that's keyed by
 * the user's id. Sensitive fields (password hash, encrypted access tokens)
 * are stripped — the export is meant to be portable, not a credential dump.
 */
export interface AccountExport {
  exportedAt: string;
  schemaVersion: 1;
  user: Omit<UserRecord, 'passwordHash'>;
  linkedAccounts: Array<{
    provider: string;
    providerUserId: string;
    providerUsername?: string;
    scopes: string[];
    createdAt: string;
    updatedAt: string;
  }>;
  votes: Array<{ id: string; communityId: string; title: string; createdAt: string }>;
  voteEntries: Array<{ id: string; voteId: string; choice: string; createdAt: string }>;
  forumPosts: Array<{ id: string; communityId: string; title: string; createdAt: string }>;
  messages: Array<{ id: string; channelId: string; createdAt: string }>;
  deadDrops: Array<{ id: string; channelId: string; createdAt: string; openedAt?: string }>;
  moderationActions: Array<{ id: string; communityId: string; action: string; reason: string; createdAt: string }>;
  refreshTokensCount: number;
  passwordResetTokensCount: number;
  emailVerificationTokensCount: number;
}

const stripUser = (user: UserRecord): Omit<UserRecord, 'passwordHash'> => {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
};

export const exportUserData = (userId: string): AccountExport | null => {
  const user = db.getUserById(userId);
  if (!user) return null;

  const linkedAccounts = db.listLinkedAccountsForUser(userId).map((row) => ({
    provider: row.provider,
    providerUserId: row.providerUserId,
    providerUsername: row.providerUsername,
    scopes: row.scopes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));

  const votes: AccountExport['votes'] = [];
  for (const vote of db.votes.values()) {
    if (vote.proposerId === userId) {
      votes.push({ id: vote.id, communityId: vote.communityId, title: vote.title, createdAt: vote.createdAt });
    }
  }

  const voteEntries: AccountExport['voteEntries'] = [];
  for (const entry of db.voteEntries.values()) {
    if (entry.userId === userId) {
      voteEntries.push({ id: entry.id, voteId: entry.voteId, choice: entry.choice, createdAt: entry.createdAt });
    }
  }

  const forumPosts: AccountExport['forumPosts'] = [];
  for (const post of db.forumPosts.values()) {
    if (post.authorId === userId) {
      forumPosts.push({
        id: post.id,
        communityId: post.communityId,
        title: post.title,
        createdAt: post.createdAt,
      });
    }
  }

  const messages: AccountExport['messages'] = [];
  for (const msg of db.messages.values()) {
    if (msg.userId === userId) {
      messages.push({ id: msg.id, channelId: msg.channelId, createdAt: msg.createdAt });
    }
  }

  const deadDrops: AccountExport['deadDrops'] = [];
  for (const dd of db.deadDrops.values()) {
    if (dd.senderId === userId || dd.recipientId === userId) {
      deadDrops.push({
        id: dd.id,
        channelId: dd.channelId,
        createdAt: dd.createdAt,
        openedAt: dd.openedAt,
      });
    }
  }

  const moderationActions: AccountExport['moderationActions'] = [];
  for (const action of db.moderationActions.values()) {
    if (action.actorId === userId || action.targetId === userId) {
      moderationActions.push({
        id: action.id,
        communityId: action.communityId,
        action: action.action,
        reason: action.reason,
        createdAt: action.createdAt,
      });
    }
  }

  const refreshTokensCount = [...db.refreshTokens.values()].filter((t) => t.userId === userId).length;
  const passwordResetTokensCount = [...db.passwordResetTokens.values()].filter(
    (t) => t.userId === userId,
  ).length;
  const emailVerificationTokensCount = [...db.emailVerificationTokens.values()].filter(
    (t) => t.userId === userId,
  ).length;

  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    user: stripUser(user),
    linkedAccounts,
    votes,
    voteEntries,
    forumPosts,
    messages,
    deadDrops,
    moderationActions,
    refreshTokensCount,
    passwordResetTokensCount,
    emailVerificationTokensCount,
  };
};

export interface IssueDeletionTokenInput {
  userId: string;
  ip?: string;
  userAgent?: string;
}

export interface IssuedDeletionToken {
  token: string;
  user: UserRecord;
  expiresAt: string;
}

export const requestAccountDeletion = (input: IssueDeletionTokenInput): IssuedDeletionToken | null => {
  const user = db.getUserById(input.userId);
  if (!user) return null;
  const token = randomBytes(DELETE_TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlSeconds() * 1000).toISOString();
  db.createAccountDeletionToken({
    id: randomUUID(),
    userId: user.id,
    tokenHash: sha256(token),
    expiresAt,
    ipHash: hashOptional(input.ip),
    userAgentHash: hashOptional(input.userAgent),
  });
  return { token, user, expiresAt };
};

export type ConfirmDeletionOutcome =
  | { kind: 'ok'; userId: string }
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'consumed' }
  | { kind: 'user_mismatch' };

export const confirmAccountDeletion = (
  presentedToken: string,
  authedUserId: string,
): ConfirmDeletionOutcome => {
  const record = db.findAccountDeletionTokenByHash(sha256(presentedToken));
  if (!record) return { kind: 'invalid' };
  if (record.consumedAt) return { kind: 'consumed' };
  if (new Date(record.expiresAt).getTime() <= Date.now()) return { kind: 'expired' };
  // The token must belong to the authed user — no cross-user deletions.
  if (record.userId !== authedUserId) return { kind: 'user_mismatch' };

  // Mark the token consumed before purging so a partial failure can't double-delete.
  db.consumeAccountDeletionToken(record.id);
  db.purgeUserAuthArtifacts(record.userId);
  db.deleteUser(record.userId);
  return { kind: 'ok', userId: record.userId };
};

export const __test__ = { sha256 };
