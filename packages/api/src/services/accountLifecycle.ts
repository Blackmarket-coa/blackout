import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { ReleaseIdentity } from '@blackout/protocol';
import { db } from '../db/store';
import type { UserRecord } from '../db/types';
import { recordToReleaseIdentity } from './releaseIdentities';
import { matrixUserIdFor } from './userIdentity';

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
 * GDPR / DSAR-style data export. Returns the user-keyed records listed in
 * AccountExport; not every table is covered yet. Sensitive fields (password
 * hash, encrypted access tokens) are stripped — the export is meant to be
 * portable, not a credential dump.
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
    moderationActions: Array<{
        id: string;
        communityId: string;
        action: string;
        reason: string;
        createdAt: string;
    }>;
    /**
     * Messages scheduled through `POST /v1/scheduled-messages`. The API holds
     * their text as plaintext until they are sent, cancelled or finally fail,
     * then clears it, so only pending ones still carry a body.
     */
    scheduledMessages: Array<{
        id: string;
        matrixRoomId: string;
        body: string;
        formattedBody?: string;
        deliverAt: string;
        status: string;
        lastError?: string;
        createdAt: string;
        deliveredAt?: string;
    }>;
    /**
     * Dead-man switches this user owns. Recipients are other people's ids, so
     * they are counted rather than listed.
     */
    deadmanSwitches: Array<{
        id: string;
        roomId: string;
        status: string;
        headline?: string;
        checkInIntervalSeconds: number;
        gracePeriodSeconds: number;
        lastCheckInAt: string;
        triggerAt: string;
        releaseAt: string;
        recipientCount: number;
        createdAt: string;
    }>;
    /**
     * Release identities this user published, current and replaced: public
     * keys only. The private halves were never sent to the server.
     */
    releaseIdentities: Array<{
        fingerprint: string;
        publishedAt: string;
        supersededAt?: string;
        identity: ReleaseIdentity;
    }>;
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
            votes.push({
                id: vote.id,
                communityId: vote.communityId,
                title: vote.title,
                createdAt: vote.createdAt,
            });
        }
    }

    const voteEntries: AccountExport['voteEntries'] = [];
    for (const entry of db.voteEntries.values()) {
        if (entry.userId === userId) {
            voteEntries.push({
                id: entry.id,
                voteId: entry.voteId,
                choice: entry.choice,
                createdAt: entry.createdAt,
            });
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

    const scheduledMessages: AccountExport['scheduledMessages'] = db
        .listScheduledMessagesForUser(userId)
        .map((msg) => ({
            id: msg.id,
            matrixRoomId: msg.matrixRoomId,
            body: msg.body,
            formattedBody: msg.formattedBody,
            deliverAt: msg.deliverAt,
            status: msg.status,
            lastError: msg.lastError,
            createdAt: msg.createdAt,
            deliveredAt: msg.deliveredAt,
        }));

    const deadmanSwitches: AccountExport['deadmanSwitches'] = db
        .listDeadmanSwitchesForOwner(userId)
        .map((sw) => ({
            id: sw.id,
            roomId: sw.roomId,
            status: sw.status,
            headline: sw.headline,
            checkInIntervalSeconds: sw.checkInIntervalSeconds,
            gracePeriodSeconds: sw.gracePeriodSeconds,
            lastCheckInAt: sw.lastCheckInAt,
            triggerAt: sw.triggerAt,
            releaseAt: sw.releaseAt,
            recipientCount: sw.recipients.length,
            createdAt: sw.createdAt,
        }));

    const releaseIdentities: AccountExport['releaseIdentities'] = db
        .listReleaseIdentitiesForAccount(userId)
        .map((record) => ({
            fingerprint: record.fingerprint,
            publishedAt: record.publishedAt,
            ...(record.supersededAt ? { supersededAt: record.supersededAt } : {}),
            identity: recordToReleaseIdentity(record),
        }));

    const refreshTokensCount = [...db.refreshTokens.values()].filter(
        (t) => t.userId === userId
    ).length;
    const passwordResetTokensCount = [...db.passwordResetTokens.values()].filter(
        (t) => t.userId === userId
    ).length;
    const emailVerificationTokensCount = [...db.emailVerificationTokens.values()].filter(
        (t) => t.userId === userId
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
        scheduledMessages,
        deadmanSwitches,
        releaseIdentities,
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

export const requestAccountDeletion = (
    input: IssueDeletionTokenInput
): IssuedDeletionToken | null => {
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
    authedUserId: string
): ConfirmDeletionOutcome => {
    const record = db.findAccountDeletionTokenByHash(sha256(presentedToken));
    if (!record) return { kind: 'invalid' };
    if (record.consumedAt) return { kind: 'consumed' };
    if (new Date(record.expiresAt).getTime() <= Date.now()) return { kind: 'expired' };
    // The token must belong to the authed user — no cross-user deletions.
    if (record.userId !== authedUserId) return { kind: 'user_mismatch' };

    // Mark the token consumed before purging so a partial failure can't double-delete.
    db.consumeAccountDeletionToken(record.id);
    // Scheduled messages: remove their text and author link, and cancel the
    // pending ones, so nothing is posted for this account after it is gone.
    for (const msg of db.listScheduledMessagesForUser(record.userId)) {
        db.eraseScheduledMessage(msg.id);
    }
    // Dead-man switches: cancel the ones that have not fired and remove what
    // the owner put in them, so none fires for an account that is gone. One
    // that has fired stays readable to the people it named; its label goes.
    for (const sw of db.listDeadmanSwitchesForOwner(record.userId)) {
        db.eraseDeadmanSwitch(sw.id);
    }
    // Invitation admissions (the use an account-number sign-up spent) hold the
    // account's Matrix id, so they go with it, claimed or not. The redemption
    // row a claim wrote stays, as every redemption row does. Read the Matrix id
    // while the user row still exists.
    db.deleteInvitationAdmissionsForUser(
        record.userId,
        matrixUserIdFor(record.userId) ?? undefined
    );
    // Release identities: the public keys go with the account, one row at a
    // time, so nothing but this account's rows is written. The private halves
    // are on the person's devices and in their recovery files, which the
    // server never had.
    for (const identity of db.listReleaseIdentitiesForAccount(record.userId)) {
        db.eraseReleaseIdentity(identity.id);
    }
    db.purgeUserAuthArtifacts(record.userId);
    db.deleteUser(record.userId);
    return { kind: 'ok', userId: record.userId };
};

export const __test__ = { sha256 };
