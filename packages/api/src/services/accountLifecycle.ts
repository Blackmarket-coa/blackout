import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type {
    DeadmanNoticeCounts,
    DeadmanReleaseFormat,
    DeadmanReleasedCopy,
    ReleaseIdentity,
} from '@blackout/protocol';
import { db } from '../db/store';
import type { UserRecord } from '../db/types';
import {
    armsInFlightSettledFor,
    isReleaseSwitch,
    noticeCounts,
    releasedCopiesFor,
    standsFired,
} from './deadmanReleases';
import { log } from '../telemetry/logger';
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
     * they are counted rather than listed; a release switch's sealed copies
     * are theirs too, and are not here.
     */
    deadmanSwitches: Array<{
        id: string;
        /** A legacy switch's room; a release switch has none. */
        roomId?: string;
        status: string;
        headline?: string;
        checkInIntervalSeconds: number;
        gracePeriodSeconds: number;
        lastCheckInAt: string;
        triggerAt: string;
        releaseAt: string;
        recipientCount: number;
        createdAt: string;
        releaseFormat: DeadmanReleaseFormat;
        /** When a release switch fired. */
        releasedAt?: string;
        /**
         * When the owner's last check-in or cancel was refused because the
         * database did not answer in time, as the server carried it into the
         * switch (decision 31 of the release envelope record); the owner's
         * own data, so it is here.
         */
        ownerAttemptRefusedAt?: string;
        /** A fired release switch's notices, counted. */
        notices?: DeadmanNoticeCounts;
    }>;
    /**
     * Releases given to this user: fired release switches that sealed a copy
     * to them, each with the header, the owner's identity at arming and this
     * user's own copy, as `GET /v1/deadman/releases` gives them. A switch
     * that has not fired is not here: before the trigger a recipient learns
     * nothing of it.
     */
    deadmanReleases: DeadmanReleasedCopy[];
    /**
     * The bot's notices to this user about fired release switches that named
     * them, as the server keeps them: the release they point at, the standing
     * room they went or were to go to, whether the person was invited again
     * for it, status, attempts, the last error and when it was sent or given
     * up. Only for switches that have fired: a row for a switch that has not
     * (a store from a crash) would tell the person of a switch before its
     * release, which the release read never does.
     */
    deadmanNotices: Array<{
        switchId: string;
        roomId?: string;
        reinvitedAt?: string;
        status: string;
        attempts: number;
        lastError?: string;
        nextAttemptAt: string;
        sentAt?: string;
        failedAt?: string;
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
            releaseFormat: sw.releaseFormat ?? 'legacy',
            ...(sw.releasedAt ? { releasedAt: sw.releasedAt } : {}),
            ...(sw.ownerAttemptRefusedAt
                ? { ownerAttemptRefusedAt: sw.ownerAttemptRefusedAt }
                : {}),
            ...(isReleaseSwitch(sw) && sw.status === 'triggered'
                ? { notices: noticeCounts(sw.id) }
                : {}),
        }));
    const deadmanReleases = releasedCopiesFor(userId);
    const deadmanNotices: AccountExport['deadmanNotices'] = db
        .listDeadmanReleaseNoticesForRecipient(userId)
        .filter((notice) => {
            // A switch that stands fired (`standsFired`), as every reader
            // asks: one cancelled with its `releasedAt` kept (a shape only
            // written before round 12) is not listed.
            const record = db.getDeadmanSwitch(notice.switchId);
            return record !== undefined && standsFired(record);
        })
        .map((notice) => ({
            switchId: notice.switchId,
            ...(notice.roomId ? { roomId: notice.roomId } : {}),
            ...(notice.reinvitedAt ? { reinvitedAt: notice.reinvitedAt } : {}),
            status: notice.status,
            attempts: notice.attempts,
            ...(notice.lastError ? { lastError: notice.lastError } : {}),
            nextAttemptAt: notice.nextAttemptAt,
            ...(notice.sentAt ? { sentAt: notice.sentAt } : {}),
            ...(notice.failedAt ? { failedAt: notice.failedAt } : {}),
            createdAt: notice.createdAt,
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
        deadmanReleases,
        deadmanNotices,
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

/**
 * The account deletion's writes for what release switches hold for the
 * account as a recipient, on the store given (`confirmAccountDeletion` passes
 * the process's own; the cross-process test passes a second store as the API
 * process). Every copy sealed to the account goes, fired or not: the copies
 * on other people's switches (nobody is left to open them; the owner's view
 * then shows no copy held for this recipient) and its own copies on its own
 * switches. A notice still to be sent to the account ends, and every notice
 * row of theirs forgets the room that tied the account to a Matrix id. These
 * reach the rows this store's mirror has; rows another process wrote that it
 * has not heard of yet are reached by `finishAccountDeletion`.
 */
export const eraseReleaseCopiesAndNoticesOf = (
    store: typeof db,
    accountId: string,
    at: string = new Date().toISOString()
): void => {
    for (const wrap of store.listDeadmanReleaseWrapsForRecipient(accountId)) {
        store.eraseDeadmanReleaseWrap(wrap.switchId, wrap.recipientAccountId);
    }
    for (const notice of store.listDeadmanReleaseNoticesForRecipient(accountId)) {
        store.updateDeadmanReleaseNotice(notice.switchId, notice.recipientAccountId, {
            roomId: undefined,
            ...(notice.status === 'pending'
                ? { status: 'failed', failedAt: at, lastError: 'recipient_gone' }
                : {}),
        });
    }
};

/** How long the deletion route waits for the deletion's last statement before it answers anyway. */
export const ACCOUNT_DELETION_FINISH_TIMEOUT_MS = 10 * 1000;

/**
 * What an account deletion finishes once its writes are made. First the
 * deletion's own writes, in the database: the route answers only once every
 * write this process had queued (the deletion's among them) has been
 * attempted there, however long that takes (a write that fails twice is
 * dropped and logged, as everywhere in Postgres mode, and the wait still
 * ends). Nothing bounds that wait: a pool that never hands out a connection,
 * or a query that never answers (a lock wait, a connection the network
 * dropped after it connected), holds the answer, the session having been
 * revoked first; the pool is given neither a connection timeout nor a
 * statement timeout (`config/postgres.ts`), and a connection timeout alone
 * would not end the second. A reverse proxy in front ends the request at its
 * read timeout instead, where it has one (an hour in the nginx site configs'
 * `location /v1/`, which the app calls same-origin; production's Caddy sets
 * none, so there the browser gives up first), and the
 * screen then says the deletion may not have finished, although this process
 * has applied it to its mirror, revoked the token and queued its writes,
 * which land when the database answers and are lost if the process stops
 * first (decision 27). So by the answer the
 * person's copies are blanked in the database and the notice rows this
 * process had seen are ended there, unless one of those writes was dropped,
 * and another process (the worker) makes no room, invites nobody and sends
 * nothing for them after its next read of the database (a call it already
 * had on its way to the homeserver can still reach them). Then, in the
 * database itself, the deletion's last statements. First every switch the
 * database holds for the account as its owner is erased as the deletion
 * erases one (an unfired one cancelled and emptied with its copies blanked,
 * a fired one keeping its content, `releasedAt` and the people's copies),
 * and every copy still held that is sealed to the account is blanked
 * (`eraseDeadmanSwitchesOfDeletedOwner`), so a switch this process's mirror
 * did not have when the deletion listed the owner's switches is erased too:
 * one whose arm was answered 503 and whose insert landed, one whose failed
 * statement committed before this, one another process armed before it heard
 * of the deletion (round 13 of part 2's review); every switch of the owner's
 * and every copy of theirs is then read from the database into this
 * process's mirror, so a release that fired elsewhere and which this mirror
 * never had is served here from now on (round 14: the fired row went in
 * without the recipients' copies, and the release was listed to nobody on
 * the deleting process until it restarted). Then every notice still
 * pending to the account ends and every notice row of theirs forgets its
 * room, including a row another process wrote that this one had not heard of
 * (the worker's sweep, moments before; `endDeadmanReleaseNoticesOfDeletedAccount`).
 * Nothing to do with one process. The route awaits them after
 * `confirmAccountDeletion` and after it revokes the session; a failure of
 * either is logged, the deletion stands, the other still runs, and such a row
 * is then as the notifier, or the switch as the sweep, leaves it (round 6).
 * The wait for these last statements alone is bounded: past `timeoutMs`
 * (their connection, or writes queued after the deletion's, stalled) it is
 * logged and this returns, and the statements go on without anyone waiting
 * for them, landing when they can (round 7: unbounded, a stalled pool held
 * the route's answer for good; round 8: the bound covered the drain of the
 * deletion's own writes too, so the route could answer before any of them
 * was in the database, and the worker then made the person a room, invited
 * them and sent the notice).
 */
export const finishAccountDeletion = async (
    accountId: string,
    store: typeof db = db,
    timeoutMs: number = ACCOUNT_DELETION_FINISH_TIMEOUT_MS
): Promise<void> => {
    try {
        await store.drain();
    } catch (err) {
        // The queue logs and drops a failed write itself; this is not
        // expected, and the deletion stands either way.
        log.warn('account_deletion_drain_failed', {
            error: err instanceof Error ? err.message : String(err),
        });
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const end = (async (): Promise<'done' | 'failed'> => {
        let failed = false;
        try {
            await store.eraseDeadmanSwitchesOfDeletedOwner(accountId);
        } catch (err) {
            log.warn('account_deletion_switches_finish_failed', {
                error: err instanceof Error ? err.message : String(err),
            });
            failed = true;
        }
        try {
            await store.endDeadmanReleaseNoticesOfDeletedAccount(
                accountId,
                new Date().toISOString()
            );
        } catch (err) {
            log.warn('account_deletion_finish_failed', {
                error: err instanceof Error ? err.message : String(err),
            });
            failed = true;
        }
        return failed ? 'failed' : 'done';
    })();
    const outcome = await Promise.race([
        end,
        new Promise<'timeout'>((resolve) => {
            timer = setTimeout(() => resolve('timeout'), timeoutMs);
        }),
    ]);
    clearTimeout(timer);
    if (outcome === 'timeout') {
        log.warn('account_deletion_finish_timeout', { timeoutMs });
    }
};

export type ConfirmDeletionOutcome =
    | { kind: 'ok'; userId: string }
    | { kind: 'invalid' }
    | { kind: 'expired' }
    | { kind: 'consumed' }
    | { kind: 'user_mismatch' };

/**
 * Confirm and carry out an account deletion. Everything but the switches is
 * written to this process's mirror synchronously, before the first `await`:
 * the release identities, the scheduled messages, every copy sealed to the
 * account and the notices owed to it, the invitation admissions, the auth
 * artefacts and the user row itself; `onConfirmed` runs first, once the token
 * is consumed (the route revokes the deleting session's token in it, so the
 * token is refused on this process from that moment: round 7 of part 2's
 * review). So from the first `await` on, the account's other sessions find no
 * account on this process: publishing a release identity is refused
 * `no_account`, and arming and re-sealing are refused `no_account` (and for
 * want of an owner identity) before anything is written (round 13: the user
 * row and the copies waited behind the switches' statements, so another
 * session could publish a fresh identity in that window, arm with it, and
 * leave a switch that fired for the account after it was gone; and a notice
 * whose send answered in that window was recorded sent).
 *
 * Then the switches. From before the first `await` until every switch this
 * process lists has had its statement, the owner is marked on this process
 * (`beginOwnerDeletion`), and the sweep here moves none of the owner's
 * switches meanwhile (round 14 of part 2's review: a switch whose deadline
 * fell inside the deletion's awaits was fired by the deleting process's own
 * sweep, with the owner's row already gone from its mirror, then erased as
 * fired and served). First the arms of the owner's this process is still
 * writing, already past their checks, are waited for
 * (`armsInFlightSettledFor`; each one that lands for an account that is gone
 * erases its own switch and is refused), for at most `armsWaitMs`
 * (`ACCOUNT_DELETION_ARMS_WAIT_MS`, 30 s, the switch statements' own bound;
 * decision 33): an arm still unanswered after that (its failed statement's
 * read-back waiting on a pool that does not answer) is left to erase its own
 * switch when it answers, or to the deletion's last statement, and the wait's
 * end is logged (`account_deletion_arms_wait_timeout`; round 14: the wait had
 * no bound, so such a pool held the deletion's answer for good, the account
 * already gone). Only then are the owner's switches listed (round 13: an arm
 * whose insert was being written when the deletion listed them landed after
 * the list and stayed armed). Each switch
 * of the owner's is erased by one call decided in the database
 * (`eraseDeadmanSwitchUnlessFired`, decision 30, built in round 12 of part
 * 2's review; statements on one connection, not a transaction): one that has
 * not fired there is cancelled and emptied, and its sealed copies are
 * blanked; one the database shows fired, on this process or another this
 * process had not heard from, is erased as fired: its label goes, and so
 * does the owner's own copy (above, with every copy sealed to this account),
 * while its content, the owner's identity it was signed with (E13), its
 * `releasedAt` and the recipients' copies stay until the removal at least 365
 * days after it fired, as decision 12 describes, since nothing can be
 * re-sealed after the trigger and nobody is left to open the owner's copy.
 * The same call erases a legacy switch that fired elsewhere as fired (its
 * payload stays for the people it named, as before; its label goes). Where
 * the database does not answer the call in time, is not sent it because
 * another switch statement stands unanswered, or fails it, the store queues
 * the same call in the switch's lane (`queued`, logged), which decides on the
 * database's row when it runs and which the route's wait for this process's
 * queued writes covers; nothing writes this process's view of the switch over
 * the row (round 12's check), and the mirror holds no view of its own of the
 * erase meanwhile (round 13). The route then runs `finishAccountDeletion`,
 * whose last statements erase, in the database, every switch it holds for
 * the owner, including one this process never had.
 */
/**
 * How long the deletion waits for the owner's arms this process is still
 * writing before it lists the switches without them (decision 33 of the
 * release envelope record): the switch statements' own bound.
 */
export const ACCOUNT_DELETION_ARMS_WAIT_MS = 30 * 1000;

export const confirmAccountDeletion = async (
    presentedToken: string,
    authedUserId: string,
    onConfirmed?: (userId: string) => void,
    armsWaitMs: number = ACCOUNT_DELETION_ARMS_WAIT_MS
): Promise<ConfirmDeletionOutcome> => {
    const record = db.findAccountDeletionTokenByHash(sha256(presentedToken));
    if (!record) return { kind: 'invalid' };
    if (record.consumedAt) return { kind: 'consumed' };
    if (new Date(record.expiresAt).getTime() <= Date.now()) return { kind: 'expired' };
    // The token must belong to the authed user — no cross-user deletions.
    if (record.userId !== authedUserId) return { kind: 'user_mismatch' };

    // Mark the token consumed before purging so a partial failure can't double-delete.
    db.consumeAccountDeletionToken(record.id);
    onConfirmed?.(record.userId);
    // Everything but the switches, before any await: see above.
    // Release identities: the public keys go with the account, one row at a
    // time, so nothing but this account's rows is written. The private halves
    // are on the person's devices and in their recovery files, which the
    // server never had.
    for (const identity of db.listReleaseIdentitiesForAccount(record.userId)) {
        db.eraseReleaseIdentity(identity.id);
    }
    // Scheduled messages: remove their text and author link, and cancel the
    // pending ones, so nothing is posted for this account after it is gone.
    for (const msg of db.listScheduledMessagesForUser(record.userId)) {
        db.eraseScheduledMessage(msg.id);
    }
    // Every copy sealed to this account goes, and the notices owed to it
    // end and forget their room (`eraseReleaseCopiesAndNoticesOf`; the route
    // then runs `finishAccountDeletion` for rows another process wrote).
    eraseReleaseCopiesAndNoticesOf(db, record.userId);
    // Invitation admissions (the use an account-number sign-up spent) hold the
    // account's Matrix id, so they go with it, claimed or not. The redemption
    // row a claim wrote stays, as every redemption row does. Read the Matrix id
    // while the user row still exists.
    db.deleteInvitationAdmissionsForUser(
        record.userId,
        matrixUserIdFor(record.userId) ?? undefined
    );
    db.purgeUserAuthArtifacts(record.userId);
    db.deleteUser(record.userId);
    // Dead-man switches: cancel the ones that have not fired and remove what
    // the owner put in them, so none fires for an account that is gone. One
    // that has fired, in the database's judgement, stays readable to the
    // people it named; its label goes. While the statements are on their way
    // this process's sweep moves none of the owner's switches (the mark,
    // round 14). The arms already past their checks first, for at most the
    // bound, so that what they wrote is listed.
    db.beginOwnerDeletion(record.userId);
    try {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const arms = await Promise.race([
            armsInFlightSettledFor(record.userId).then(() => 'settled' as const),
            new Promise<'timeout'>((resolve) => {
                timer = setTimeout(() => resolve('timeout'), armsWaitMs);
            }),
        ]);
        clearTimeout(timer);
        if (arms === 'timeout') {
            log.warn('account_deletion_arms_wait_timeout', { timeoutMs: armsWaitMs });
        }
        for (const sw of db.listDeadmanSwitchesForOwner(record.userId)) {
            const outcome = await db.eraseDeadmanSwitchUnlessFired(sw.id);
            if (outcome.kind === 'queued') log.warn('account_deletion_switch_erase_queued', {});
        }
    } finally {
        db.endOwnerDeletion(record.userId);
    }
    return { kind: 'ok', userId: record.userId };
};

export const __test__ = { sha256 };
