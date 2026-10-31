/**
 * The release notifier: sends the bot's notice to each recipient of a fired
 * release switch (`docs/security/deadman-release-design-2026-10-24.md` §5;
 * `release-envelope-2026-10-26.md` §11).
 *
 * The sweep writes one `deadman_release_notices` row per recipient as it fires
 * a release switch; this loop, beside it, sends them. Each notice is an
 * `m.text` in the recipient's standing "Blackout notices" room, a room the bot
 * creates, one per person and reused (except where §11 and the paragraphs
 * below say), with the person invited as a direct message and
 * power levels under which only the bot posts or invites. The room is **not
 * end-to-end encrypted**, and is made so deliberately: the bot is a plain HTTP
 * client with no Megolm implementation and cannot encrypt, so the notice is
 * plaintext whatever the room's state says, and a room whose state says
 * "encrypted" around a plaintext post would overstate what the room is. The
 * homeserver's backstop (`encryption_enabled_by_default_for_room_type:
 * invite`, set by every in-repo template) adds `m.room.encryption` to every
 * `private_chat` room after the client's `initial_state`, so the room is
 * created with the `public_chat` preset, which that setting leaves alone, and
 * an explicit invite-only join rule in `initial_state`, which Synapse sends in
 * place of the preset's public one (`handlers/room.py`,
 * `_send_events_for_new_room`); its visibility is `private`, so it is not in
 * the public room list (its alias, below, is in the homeserver's alias
 * directory, which does not say whose it is). `public_chat` also sends no
 * `m.room.guest_access` event (guests cannot join, which is wanted) and leaves
 * the power to invite at 50, which the override sets anyway. Under `all`,
 * which no template sets, the backstop would encrypt this preset too. The
 * notice carries a fixed body and a pointer to the release id, and nothing
 * else: not the owner, not the label, not anyone else named, no time, no
 * content. An `m.notice` would be silent under `.m.rule.suppress_notices`.
 *
 * What "sent" means: the homeserver accepted the event. Whether it reaches the
 * person is the homeserver's (and their client's) business; the release itself
 * is the API's own store, and the app's "Released to you" view works without a
 * notice. A failed or thrown homeserver call is that notice's attempt, retried
 * with backoff (30 s, doubling to 6 h) for 30 days from the release, then
 * recorded as failed for the operator; a recipient whose account is gone, or a
 * release that is not there to point at (cancelled, removed, never a release),
 * ends the notice at once. A row for a release switch that has not fired yet
 * (a store from a crash) is left alone until it does. A person who left or
 * declined their room is invited again, at most once per notice. Logs carry
 * counts, and for a throw that is not a homeserver call the error's message;
 * never who or where.
 *
 * One room per person: a per-recipient slot serialises finding or making the
 * room, and a notice that waited for the slot reads the room again before
 * deciding, so two notices for one person in overlapping ticks make one room;
 * the interval's tick does not start while the previous one runs. The room
 * also carries an alias, `#blackout-notices-<hmac>:<server>`: 128 bits of an
 * HMAC over the person's Matrix id under a key derived from the API's
 * `JWT_SECRET_PRIMARY` (`noticeRoomAliasLocalpart`). Nobody without the secret
 * can compute it, so the alias directory does not tell anyone who has a
 * notices room; the person sees it as the room's address. The homeserver
 * refuses a second room with a taken alias before it makes one
 * (`M_ROOM_IN_USE`), so a `createRoom` it finished after this side stopped
 * waiting, or one another API process made first, is found through the alias
 * on the next attempt instead of being made again (as first fixed, each such
 * attempt left the person one more empty "Blackout notices" room with an
 * invite: round 3 of part 2's review). The homeserver writes the alias after
 * it makes the room id and before it sends any event, and then writes the room
 * in steps (`handlers/room.py`, `create_room` and `_send_events_for_new_room`:
 * `m.room.create` alone, the creator's join, then one batch with the power
 * levels and the rest, then the invites). So a room found through the alias
 * that is not yet the whole room the create makes (no `m.room.create`; or the
 * bot's, without the bot's own join or without power levels that keep the
 * person from posting and inviting) is taken for a create still in progress
 * and retried once; still so at the notice's next attempt, which is due one
 * backoff (30 s at the least) after that first look was recorded, it is taken
 * for a create the homeserver abandoned part way (a restart, or a failure
 * between those writes), which leaves the alias naming that incomplete room
 * for good, and the room is made without the alias. (As first fixed a room
 * with no events was retried for the whole window, and every later notice to
 * that person with it: round 4 of part 2's review. As round 4 left it, a room
 * with the create alone was taken as the bot's and its re-invite refused,
 * `M_NOT_JOINED`, for the window, a room with the create and the bot's join
 * was used with no power levels, and the retry was timed from the tick's
 * start, so after a long tick the second look could come seconds after the
 * first: round 5.) What the alias leaves (`makeRoom`): a
 * secret rotation between a create that timed out and its retry changes the
 * alias, so that room is not found and another is made; a homeserver that
 * refuses the alias itself (an alias policy, or an appservice's namespace), an
 * alias naming a room that is gone, that the bot did not make or that the
 * homeserver abandoned, and a wrong id for the bot (below), each get a room
 * without an alias, and a create of that room which times out after the
 * homeserver made it leaves one more room, as before the alias; a create still
 * in progress after a whole backoff is taken for an abandoned one, and leaves
 * one more room the same way; and two processes making one person's room at
 * the same moment both pass the homeserver's alias check, and the second's
 * alias write then fails after the homeserver gave it a room id but before any
 * event, so that room has nobody in it and nobody invited. When the homeserver
 * no longer has a person's room, the replacement is recorded on every one of
 * their rows that pointed at the old one. The row is read again after every
 * homeserver call and before anything is written to it: a deletion that landed
 * while the room was being found or made, or during the send, has already
 * ended the row with `recipient_gone`, and that stands whatever the call
 * answered (no room is recorded on it, no re-invite, no send, no attempt, no
 * later error over its reason); a row ended any other way meanwhile is left as
 * it is. That read is this process's mirror. Where the deletion runs in
 * another process (the API process, with the loops in a worker of their own,
 * as `deploy/docker/production` runs them), or another notifier has the same
 * notice (two leaders during a handover), four things carry the database's
 * view here. Every change written here is conditional in Postgres
 * (`updateDeadmanReleaseNoticeIf`: applied only while the stored row is still
 * pending, or still names the room it is being moved off), and the catch-up's
 * creation of a row the mirror lacks is insert-only there
 * (`createDeadmanReleaseNotice`), so nothing here lands over a row another
 * process ended or sent (round 5 of part 2's review: the notifier's full-row
 * write landed over the deletion's, and Postgres ended `sent` with the room;
 * round 6: the catch-up's create set a sent row back to pending in Postgres).
 * Before anything is asked of the homeserver, and again right before it makes
 * a room, invites the person and sends, the notifier reads the person's copy
 * and the notice row from the database itself, not from the mirror
 * (`checkDatabase`, through `readDeadmanReleaseCommitted`), and the first
 * read also the person's newest recorded room there, each read bounded as a
 * homeserver call is (`database_read_timeout`, a retry). A row the database
 * has as sent or ended is taken as it is there and nothing is written to it;
 * one it has pending with a retry set for later than now is left for that
 * time, nothing written either; and the stored row goes into this mirror
 * (unless this process wrote to it during the read; where a write of this
 * process's to it was dropped, the stored row is the older, and a room or a
 * re-invite the mirror recorded on a row still pending is kept). A notice
 * whose own row names no room takes the newest room any row of the person's
 * records, in the mirror or in the database. So a leader taking over within
 * the change notification's lag, whose catch-up wrote the row its mirror
 * lacked as pending and due, sends nothing the old leader sent, waits for a
 * retry the old leader set (an alias room the old leader found still being
 * made gets its whole backoff), and takes the room the old leader recorded
 * on any of the person's notices rather than make another (round 7:
 * insert-only kept Postgres at `sent`, but the new leader's own tick sent the
 * notice again from its mirror, and with the alias refused made a second
 * room and invited the person into it; round 8: it attempted at once a row
 * the old leader had set to retry, and took a room still being made for an
 * abandoned one, and with the alias refused it made a second room for
 * another of the person's notices when only the old leader's rows recorded
 * the person's room). A deletion blanks every copy sealed to the
 * account before it ends the notices and deletes the user row, so once it has
 * committed, no room is made, nobody is invited and nothing is sent for that
 * person after the next of those reads, also for a notice row the deleting
 * process had not heard of when it deleted (the sweep wrote it moments
 * before), which its own writes could not end (round 6: such a notice was
 * sent after the deletion and kept its room for good; round 7: with no read
 * right before a create or a re-invite, a deletion that committed while a
 * known room's state was being read still got a room made for the person's
 * Matrix id, or them invited again). A copy this process's mirror holds and
 * the database does not (its write failed twice and was dropped) ends the
 * notice `failed` with `copy_unavailable`, unsent. And the deletion finishes
 * with one statement in the database (`finishAccountDeletion`) that ends
 * every notice row still pending to the account and forgets the room of every
 * one, that row included. Until the other process's change notification
 * arrives, this process's mirror and its tick's count can say sent where the
 * database says otherwise. What is left: a create, a re-invite or a send
 * already on its way to the homeserver when the deletion committed (after the
 * read just before it) can still reach the person, as on one process; a
 * deletion that commits after this process's write to a row it had seen lands
 * over it, as its own write: no room, and, unless it had already seen the row
 * sent, `failed` with `recipient_gone` for a notice the homeserver accepted,
 * as on one process when the deletion lands during the send; for a row it had
 * not seen whose send was in flight, the row ends `failed` with
 * `recipient_gone` if the deletion's last statement comes first, and `sent`
 * with no room if this process's write does; two notifiers working on the
 * person's notices at the same moment (one notice both read pending before
 * either recorded it, or two of the person's notices before either recorded
 * a room) can, where the homeserver refuses the alias, each make the person a
 * room and send there, and the transaction id is deduplicated only within one
 * room (below), so the person can get an invitation and the notice in each of
 * two rooms (with the alias, the second create finds the first's room, and
 * two sends of one notice into it are deduplicated while the homeserver keeps
 * the id); and until the deletion's last statement has run, which can be
 * after the route answered (it waits for it at most 10 s), and for good if it
 * fails (logged) or the API process stops before it, a row it had not seen
 * keeps what the notifier wrote, a room and `sent` included where the send
 * had begun before the deletion committed (a row still pending the notifier
 * ends itself at its next read: the route answers only once the deletion's
 * own writes, the blanked copies among them, have been attempted in the
 * database).
 *
 * Each homeserver call has `NOTICE_CALL_TIMEOUT_MS` to answer; one that does
 * not is that notice's retry (`matrix_<call>_timeout`) and its request is
 * aborted. Without that, one connection the homeserver accepted and never
 * answered would hold the tick, and with it every other due notice, for
 * undici's default of five minutes, since the ticks do not overlap. Each
 * database read above has the same bound. A tick is still a sequence, and a
 * notice makes up to seven homeserver calls in turn (the state of a known
 * room, a create, the alias lookup, the bot's own id, the state of the room
 * found, a re-invite or a create without the alias, the send) and up to four
 * database reads among them (before the first call, and right before the
 * first create, the second create or the re-invite, and the send). The bot's
 * id is cached for the process after the first whoami that is not cut short,
 * by this loop or any other caller in the API, a failed one included (a
 * refusal or a network error): that one caches the client's derived
 * `@<MATRIX_BOT_LOCALPART or blackout>:<domain>`, and if that is not the
 * bot's, every room found through an alias looks like another account's and is
 * replaced by one without it. So a homeserver that answers nothing holds a
 * tick of 50 notices for about 25 minutes, each notice ending at its first
 * call's timeout, and a database that answers nothing does the same at each
 * notice's first read; a homeserver and a database that answer slowly rather
 * than not at all, in just under the timeout each time, can hold one notice
 * for up to eleven timeouts (five and a half minutes) and a tick of 50 for
 * about four and a half hours, with every notice due beyond the 50 waiting
 * for the next tick. A read that timed out goes on in the background (it
 * cannot be aborted), so a stalled database can leave one waiting connection
 * per such notice. The worker's
 * shutdown waits for a tick in flight only up to its own bound
 * (`backgroundTicks.ts`).
 *
 * Matrix transaction id `deadman-release-<switch>-<recipient>`, so a resend
 * soon after a crash, or a retry of a send the homeserver accepted after the
 * call's timeout, into the same room is deduplicated (the homeserver keys a
 * transaction on the request's path, the room id in it, and its table below
 * on the room too, so the same id in another room is another event) for as
 * long as the homeserver keeps the id:
 * 30 to 60 minutes in its memory for a token without a device (one minted
 * through the admin API; lost on a homeserver restart), and 24 hours in its
 * database for one with a device (a `/login` token: `event_txn_id_device_id`).
 * Not through `botPostingGate.ts`: this is the bot's own post into its own
 * room, not a post in a user's name.
 */
import { createHmac } from 'node:crypto';
import {
    DEADMAN_NOTICE_BODY,
    DEADMAN_NOTICE_POINTER_FIELD,
    DEADMAN_NOTICE_RETRY_DAYS,
    DEADMAN_NOTICE_ROOM_NAME,
    DEADMAN_NOTICE_SCHEMA_VERSION,
} from '@blackout/protocol';
import { db } from '../db/store';
import type { DeadmanReleaseNoticeRecord, DeadmanSwitchRecord } from '../db/types';
import { matrixClient } from '../integrations/matrix-client';
import { log } from '../telemetry/logger';
import { readAuthRuntimeConfig } from './auth';
import { trackBackgroundTick } from './backgroundTicks';
import { isReleaseSwitch, wrapIsHeld, writeReleaseNotices } from './deadmanReleases';
import { homeserverDomain, matrixUserIdFor } from './userIdentity';

export const DEFAULT_INTERVAL_MS = 30 * 1000;
/** The first retry waits this long; each further one doubles it, up to the cap. */
export const NOTICE_BACKOFF_FIRST_MS = 30 * 1000;
export const NOTICE_BACKOFF_MAX_MS = 6 * 60 * 60 * 1000;
/** How long after the release a notice is retried. */
export const NOTICE_RETRY_WINDOW_MS = DEADMAN_NOTICE_RETRY_DAYS * 24 * 60 * 60 * 1000;
/** Notices one tick sends at most: a bound on homeserver calls per tick. */
export const NOTICES_PER_TICK = 50;
/** How long one homeserver call may take before it is this notice's retry (`matrix_<call>_timeout`). */
export const NOTICE_CALL_TIMEOUT_MS = 30 * 1000;

/**
 * The notices room's join rule, sent in `initial_state` so that Synapse does
 * not send the `public_chat` preset's public one (it sends the preset's join
 * rule only when `initial_state` has none).
 */
export const NOTICE_ROOM_JOIN_RULE = {
    type: 'm.room.join_rules',
    state_key: '',
    content: { join_rule: 'invite' },
} as const;

/**
 * The power levels the create asks for: only the bot (the creator, at 100)
 * posts or invites; the person joins at 0 and cannot type there.
 */
export const NOTICE_ROOM_POWER_LEVELS = { events_default: 50, invite: 50 } as const;

/** The notices room's alias localpart starts with this; the rest is `noticeRoomAliasLocalpart`'s HMAC. */
export const NOTICE_ROOM_ALIAS_PREFIX = 'blackout-notices-';

/**
 * The localpart of a person's notices-room alias: the prefix and 128 bits of
 * an HMAC over their Matrix id, keyed by a key derived for this purpose from
 * `JWT_SECRET_PRIMARY`. Stable for one person on one secret, so a create the
 * homeserver finished after this side stopped waiting is found by it; not
 * computable without the secret, so the alias directory does not tell anyone
 * whether a person has a notices room. The Matrix id, not the account id: the
 * room's own membership already ties the room to the Matrix id, and account
 * deletion forgets the rooms on the account's rows (`accountLifecycle.ts`),
 * which an alias over the account id would undo for whoever holds the secret.
 */
export const noticeRoomAliasLocalpart = (mxid: string): string => {
    const purposeKey = createHmac('sha256', readAuthRuntimeConfig().signingSecret)
        .update('blackout-deadman-notice-room-alias')
        .digest();
    const digest = createHmac('sha256', purposeKey).update(mxid).digest('hex');
    return `${NOTICE_ROOM_ALIAS_PREFIX}${digest.slice(0, 32)}`;
};

/** The full alias, `#<localpart>:<server name>`, as the directory is asked for it. */
export const noticeRoomAlias = (mxid: string): string =>
    `#${noticeRoomAliasLocalpart(mxid)}:${homeserverDomain()}`;

/** Why a notice stopped being retried before the window closed. */
export type NoticeTerminalReason =
    | 'copy_unavailable'
    | 'recipient_gone'
    | 'release_unavailable'
    | 'retry_window_over';

/** The wait before attempt `attempts + 1`, given `attempts` so far. */
export const noticeBackoffMs = (attempts: number): number =>
    Math.min(NOTICE_BACKOFF_FIRST_MS * 2 ** Math.max(0, attempts - 1), NOTICE_BACKOFF_MAX_MS);

/** The homeserver calls the notifier makes, so a test can hand it a stand-in. */
export type MatrixForNotices = Pick<
    typeof matrixClient,
    | 'botUserId'
    | 'createRoom'
    | 'getRoomStateAdmin'
    | 'inviteToRoom'
    | 'resolveRoomAlias'
    | 'sendEvent'
>;

export interface NotifierResult {
    /** Rows written for fired release switches that lacked them (a crash between trigger and rows). */
    caughtUp: number;
    /** Notices that were due this tick (at most `NOTICES_PER_TICK`; a stop mid-tick leaves the rest uncounted below). */
    due: number;
    /** Accepted by the homeserver for this tick's attempt. */
    sent: number;
    /** Failed this tick and left pending for a later attempt. */
    retried: number;
    /**
     * Ended without a send: the window closed, the recipient is gone, or the
     * release is not there; or found ended so (an account deletion, another
     * process) when this tick finished with it.
     */
    failed: number;
    /**
     * Due, but another tick had it: one an overlapping tick in this process
     * holds (skipped), one found sent by another process (two notifiers
     * during a leader handover, say) when this tick finished with it, or one
     * the database has pending with a retry another process set for later
     * (`checkDatabase`). Nothing is written to them here, and they are not
     * counted as sent, retried or failed.
     */
    elsewhere: number;
}

/** The notice's content: the fixed body and the pointer, nothing else. */
export const noticeContent = (releaseId: string): Record<string, unknown> => ({
    msgtype: 'm.text',
    body: DEADMAN_NOTICE_BODY,
    [DEADMAN_NOTICE_POINTER_FIELD]: {
        schemaVersion: DEADMAN_NOTICE_SCHEMA_VERSION,
        releaseId,
    },
});

export const noticeTxnId = (switchId: string, recipientAccountId: string): string =>
    `deadman-release-${switchId}-${recipientAccountId}`;

let timer: ReturnType<typeof setInterval> | null = null;
/** Whether the interval's tick is running, so one that outlives the interval is not overlapped. */
let running = false;
/** Bumped by every stop, so a tick in flight leaves the rest pending. */
let stopGeneration = 0;
/** Notices a tick is working on, so an overlapping tick does not send one twice. */
const inFlight = new Set<string>();
/**
 * Recipients whose standing room is being found or made, one promise chain
 * each: a second notice for the same person waits here and then reads the
 * room again, so two notices in overlapping ticks make one room.
 */
const roomSlots = new Map<string, Promise<void>>();

const withRoomSlot = async <T>(recipientAccountId: string, work: () => Promise<T>): Promise<T> => {
    const previous = roomSlots.get(recipientAccountId) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((resolve) => {
        release = resolve;
    });
    const queued = previous.then(() => mine);
    roomSlots.set(recipientAccountId, queued);
    await previous;
    try {
        return await work();
    } finally {
        release();
        if (roomSlots.get(recipientAccountId) === queued) roomSlots.delete(recipientAccountId);
    }
};

type Step =
    | { kind: 'sent' }
    | { kind: 'retry'; reason: string }
    | { kind: 'failed'; reason: string }
    /**
     * The database has the row as sent or ended, by another process, while
     * this process's mirror still read it pending: nothing is written here,
     * and it is counted as it stands there.
     */
    | { kind: 'ended'; status: 'sent' | 'failed' }
    /**
     * The database has the row pending with its next attempt later than this
     * read: another process attempted it and recorded a retry this process's
     * mirror had not heard of (a leader taking over within the change
     * notification's lag). Nothing is written here; the row, which the store
     * put in the mirror, waits for its time, and is counted as elsewhere.
     */
    | { kind: 'notDue' };

/** A homeserver call that threw, carried to `processOne` as this notice's retry. */
class NoticeCallThrew extends Error {
    constructor(readonly step: { kind: 'retry'; reason: string }) {
        super(step.reason);
    }
}

/**
 * Run one homeserver call for a notice: a throw (a network error, say) is that
 * notice's retry, and so is a call that has not answered after `timeoutMs`,
 * whose request is aborted through the signal handed to it. The race does not
 * rely on the signal being honoured: a call that ignores it still ends here.
 */
const guarded = async <T>(
    call: string,
    timeoutMs: number,
    run: (signal: AbortSignal) => Promise<T>
): Promise<T> => {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);
    try {
        return await Promise.race([
            run(controller.signal),
            new Promise<never>((_, reject) => {
                controller.signal.addEventListener(
                    'abort',
                    () => reject(new Error(`matrix_${call}_timeout`)),
                    { once: true }
                );
            }),
        ]);
    } catch {
        throw new NoticeCallThrew({
            kind: 'retry',
            reason: timedOut ? `matrix_${call}_timeout` : `matrix_${call}_network_error`,
        });
    } finally {
        clearTimeout(timer);
    }
};

/** The row as it stands, or `undefined` once it is no longer pending (a deletion ended it, say). */
const stillPending = (key: {
    switchId: string;
    recipientAccountId: string;
}): DeadmanReleaseNoticeRecord | undefined => {
    const row = db.getDeadmanReleaseNotice(key.switchId, key.recipientAccountId);
    return row && row.status === 'pending' ? row : undefined;
};

/**
 * Read the person's copy and the notice row as the database has them, not as
 * this process's mirror does (`readDeadmanReleaseCommitted`), and, with
 * `personsRoom`, the person's newest recorded room there; bounded as a
 * homeserver call is: a read that has not answered after `timeoutMs` is that
 * notice's retry (`database_read_timeout`). A database error is thrown to
 * `processOne`, a retry too (`notifier_threw`).
 */
const readDatabase = async (
    key: { switchId: string; recipientAccountId: string },
    timeoutMs: number,
    options: { personsRoom?: boolean } = {}
) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
        db.readDeadmanReleaseCommitted(key.switchId, key.recipientAccountId, options),
        new Promise<never>((_, reject) => {
            timer = setTimeout(
                () =>
                    reject(new NoticeCallThrew({ kind: 'retry', reason: 'database_read_timeout' })),
                timeoutMs
            );
        }),
    ]).finally(() => clearTimeout(timer));
};

/**
 * What a read of the database says of this attempt: the step that ends it,
 * or `undefined` to go on.
 *
 * An account deletion blanks every copy sealed to the account before it ends
 * the notices and deletes the user row, so a deletion another process
 * committed (the API process, with this loop in a worker) is seen here before
 * its change notification arrives, and also for a notice row that process
 * had not seen when it deleted (the sweep wrote it moments before), which its
 * own writes could not end (round 6 of part 2's review; round 7 added the
 * reads before a create and a re-invite). A row the database has as sent or
 * ended (another notifier sent it during a leader handover, say) is not this
 * attempt's to send, and the store has put it in the mirror (round 7). A copy
 * the mirror holds and the database has no row for is one whose write failed
 * twice and was dropped: the person exists, but nothing they could read after
 * a restart is there to point at (`copy_unavailable`). A row the database has
 * pending with its next attempt later than `clock()` is another process's
 * retry, which this process's mirror had not heard of: it is left for that
 * time, and the store has put it in the mirror with that time (round 8). On
 * one process the database is the mirror, and a row listed as due is due.
 */
const judgeCommitted = (
    key: { switchId: string; recipientAccountId: string },
    committed: Awaited<ReturnType<typeof readDatabase>>,
    clock: () => number
): Step | undefined => {
    if (!stillPending(key)) return RECIPIENT_GONE;
    const stored = committed.notice;
    if (stored && stored.status !== 'pending') return { kind: 'ended', status: stored.status };
    if (!committed.wrap) return COPY_UNAVAILABLE;
    if (!wrapIsHeld(committed.wrap)) return RECIPIENT_GONE;
    // Pending there, with a retry another process recorded for later (round
    // 8 of part 2's review: a new leader whose catch-up wrote the row due now
    // attempted it at once, and took an alias room still being made, which
    // the old leader had looked at seconds before, for an abandoned one).
    if (stored && Date.parse(stored.nextAttemptAt) > clock()) return NOT_DUE;
    return undefined;
};

/**
 * Read the database (`readDatabase`) and judge it (`judgeCommitted`). Called
 * before anything is asked of the homeserver (with the person's room, by
 * `attempt`) and again right before each create, re-invite and send.
 */
const checkDatabase = async (
    key: { switchId: string; recipientAccountId: string },
    timeoutMs: number,
    clock: () => number
): Promise<Step | undefined> => judgeCommitted(key, await readDatabase(key, timeoutMs), clock);

/**
 * The recipient is gone: the row was ended meanwhile, and nothing more is
 * recorded on it. Also what a step returns for a row this process's mirror
 * already reads as ended any other way; `processOne` counts such a row as it
 * stands and writes nothing.
 */
const RECIPIENT_GONE: Step = { kind: 'failed', reason: 'recipient_gone' };

/** The person's copy is in this process's mirror and not in the database (`checkDatabase`). */
const COPY_UNAVAILABLE: Step = { kind: 'failed', reason: 'copy_unavailable' };

/** The database has the row set to retry later than now (`checkDatabase`). */
const NOT_DUE: Step = { kind: 'notDue' };

/** A room found through the alias that is not yet the room the create makes: retried once (`checkRoom`). */
export const ALIAS_ROOM_NOT_READY = 'matrix_alias_room_not_ready';

/** Whether the person is in the room or invited to it, from the room's current state. */
const membershipOf = (
    state: Array<{ type: string; state_key?: string; content?: Record<string, unknown> }>,
    userId: string
): string | undefined => {
    const event = state.find((e) => e.type === 'm.room.member' && e.state_key === userId);
    const membership = event?.content?.membership;
    return typeof membership === 'string' ? membership : undefined;
};

type StateEvent = { type: string; state_key?: string; content?: Record<string, unknown> };

const levelOf = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/**
 * Whether a room the bot created, found through the alias, is the whole room
 * its create makes: the bot joined, and power levels under which the person
 * can neither post nor invite. The fork's `createRoom` writes the room in
 * steps (`handlers/room.py`, `_send_events_for_new_room`): `m.room.create`
 * alone, then the creator's join through `update_membership`, then one batch
 * with the power levels, the join rule, the history visibility, the
 * `initial_state` and the name, then the invites. A create the homeserver
 * abandoned after the first or the second leaves, for good, a room the bot
 * cannot invite into (it is not joined: `M_NOT_JOINED`) or one with no power
 * levels, where the person at the default 0 could post and invite anyone
 * (round 5 of part 2's review).
 */
const aliasRoomComplete = (state: StateEvent[], bot: string, mxid: string): boolean => {
    if (membershipOf(state, bot) !== 'join') return false;
    const levels = state.find(
        (e) => e.type === 'm.room.power_levels' && (e.state_key ?? '') === ''
    )?.content;
    if (!levels) return false;
    const users = levels.users as Record<string, unknown> | undefined;
    const person = levelOf(users?.[mxid]) ?? levelOf(levels.users_default) ?? 0;
    // Absent fields are 0 in Matrix's event auth.
    return person < (levelOf(levels.events_default) ?? 0) && person < (levelOf(levels.invite) ?? 0);
};

/**
 * What a room's state says: usable (the person invited or in it), not usable
 * (gone from the homeserver, or, for a room found through the alias, not one
 * the bot made), or a step for the notice.
 */
type RoomCheck = { kind: 'ok' } | { kind: 'unusable' } | Step;

/**
 * Read a room's state and make sure the person is invited to it or in it:
 * one who left, declined, or never got the invite is invited again, as a
 * direct message, at most once per notice (a later attempt of this notice
 * does not invite again). `unusable` is the homeserver's 404 (purged, say)
 * and, when `madeBy` is given (a room found through the person's alias),
 * a room whose `m.room.create` another account sent: a room an admin shut
 * down with a replacement has its aliases moved to the replacement, which the
 * bot is not in. A room found through the alias that is not yet the whole
 * room the create makes (no `m.room.create`, or the bot's with no join by
 * the bot or no power levels that keep the person from posting and inviting:
 * `aliasRoomComplete`) is taken for one the homeserver is still making, and
 * retried (`ALIAS_ROOM_NOT_READY`), once: if this notice's previous attempt
 * already found it so, at least one backoff earlier (the retry is timed from
 * when that attempt was recorded), it is taken for a create the homeserver
 * abandoned part way, which never completes, and is `unusable` (round 4 of
 * part 2's review for a room with no events: retried for the window, it
 * stopped that person's notices for good; round 5 for one with the create
 * alone, where the re-invite was refused for the window, and one with the
 * create and the bot's join, which was used with no power levels). The row
 * is read again after each call, as `resolveRoom` says.
 */
const checkRoom = async (
    roomId: string,
    current: DeadmanReleaseNoticeRecord,
    mxid: string,
    matrix: MatrixForNotices,
    callTimeoutMs: number,
    clock: () => number,
    madeBy?: string
): Promise<RoomCheck> => {
    const key = { switchId: current.switchId, recipientAccountId: current.recipientAccountId };
    const state = await guarded('state', callTimeoutMs, (signal) =>
        matrix.getRoomStateAdmin(roomId, { signal })
    );
    if (!stillPending(key)) return RECIPIENT_GONE;
    if (!state.ok) {
        if ('status' in state && state.status === 404) return { kind: 'unusable' };
        return { kind: 'retry', reason: `matrix_state_${state.reason}` };
    }
    if (madeBy !== undefined) {
        const creation = state.state.find((e) => e.type === 'm.room.create');
        if (creation && creation.sender !== madeBy) return { kind: 'unusable' };
        if (!creation || !aliasRoomComplete(state.state, madeBy, mxid)) {
            if (current.lastError === ALIAS_ROOM_NOT_READY) return { kind: 'unusable' };
            return { kind: 'retry', reason: ALIAS_ROOM_NOT_READY };
        }
    }
    const membership = membershipOf(state.state, mxid);
    if (membership !== 'join' && membership !== 'invite' && !current.reinvitedAt) {
        // From the database right before the invite: a deletion committed
        // while the state was read (round 7 of part 2's review).
        const stop = await checkDatabase(key, callTimeoutMs, clock);
        if (stop) return stop;
        const invited = await guarded('invite', callTimeoutMs, (signal) =>
            matrix.inviteToRoom(roomId, mxid, undefined, { isDirect: true, signal })
        );
        if (!stillPending(key)) return RECIPIENT_GONE;
        if (!invited.ok) {
            const reason = 'reason' in invited ? invited.reason : `status_${invited.status}`;
            return { kind: 'retry', reason: `matrix_invite_${reason}` };
        }
        db.updateDeadmanReleaseNoticeIf(
            key.switchId,
            key.recipientAccountId,
            { status: 'pending' },
            { reinvitedAt: new Date().toISOString() }
        );
    }
    return { kind: 'ok' };
};

/** The create the homeserver refused for the alias alone: its alias policy forbids the bot (403), or an appservice holds the namespace (`M_EXCLUSIVE`). */
const aliasRefused = (created: { status?: number; errcode?: string }): boolean =>
    created.status === 403 || created.errcode === 'M_EXCLUSIVE';

/**
 * Ask the homeserver for the person's room: the `public_chat` preset with an
 * invite-only join rule (the header says why), out of the public room list
 * (`visibility: private`; the alias, when given, is in the alias directory),
 * the person invited as a direct message, and power levels under which only the
 * bot posts or invites. With the person's alias, so that a create this side
 * never saw the answer for is found, not made again; without it only as the
 * fallback `makeRoom` describes.
 */
const createNoticeRoom = (
    mxid: string,
    matrix: MatrixForNotices,
    callTimeoutMs: number,
    withAlias: boolean
) =>
    guarded('create', callTimeoutMs, (signal) =>
        matrix.createRoom({
            signal,
            name: DEADMAN_NOTICE_ROOM_NAME,
            ...(withAlias ? { aliasLocalpart: noticeRoomAliasLocalpart(mxid) } : {}),
            visibility: 'private',
            preset: 'public_chat',
            encrypted: false,
            initialState: [NOTICE_ROOM_JOIN_RULE],
            invite: [mxid],
            isDirect: true,
            powerLevelOverride: { ...NOTICE_ROOM_POWER_LEVELS },
        })
    );

/**
 * Make the person's room when no row knows one, or find the one the
 * homeserver already made for them. The create names the person's alias. If
 * the homeserver answers that the alias is taken (`M_ROOM_IN_USE`, which it
 * checks before it makes a room, so it made none), the alias is resolved,
 * fresh rather than from the client's process cache (a purge frees an alias
 * and a later room can take it), and the room it names is used if the bot
 * made it (its `m.room.create` is the bot's), with the person invited again
 * as `checkRoom` does, and a room still being made waited for once. Two
 * cases fall back to a room without an alias, the behaviour before the
 * alias, rather than leave the person without notices for the retry window:
 * the homeserver refuses the alias itself (an alias policy, or an
 * appservice's namespace), or the alias names a room that is gone, that the
 * bot did not make, or that still has no `m.room.create` at this notice's
 * second look (a create the homeserver abandoned). A fallback room is found again through
 * the rows, as every room is, but a create of one that times out is not found
 * afterwards. The row is read again after every call, and a row a deletion
 * ended meanwhile gets nothing recorded on it.
 */
const makeRoom = async (
    current: DeadmanReleaseNoticeRecord,
    mxid: string,
    matrix: MatrixForNotices,
    callTimeoutMs: number,
    clock: () => number
): Promise<{ roomId: string } | Step> => {
    const key = { switchId: current.switchId, recipientAccountId: current.recipientAccountId };
    const withoutAlias = async (): Promise<{ roomId: string } | Step> => {
        const stop = await checkDatabase(key, callTimeoutMs, clock);
        if (stop) return stop;
        const plain = await createNoticeRoom(mxid, matrix, callTimeoutMs, false);
        if (!stillPending(key)) return RECIPIENT_GONE;
        if (!plain.ok) return { kind: 'retry', reason: `matrix_create_${plain.reason}` };
        return { roomId: plain.roomId };
    };
    // From the database right before the create: a deletion committed while
    // a known room's state was read (round 7 of part 2's review).
    const stop = await checkDatabase(key, callTimeoutMs, clock);
    if (stop) return stop;
    const created = await createNoticeRoom(mxid, matrix, callTimeoutMs, true);
    // The row, read again before the room is recorded on it: a deletion that
    // landed during the create has ended it and forgotten its rooms, and this
    // one is not written back (the room itself stands, empty).
    if (!stillPending(key)) return RECIPIENT_GONE;
    if (created.ok) return { roomId: created.roomId };
    const refusal = {
        status: 'status' in created ? created.status : undefined,
        errcode: 'errcode' in created ? created.errcode : undefined,
    };
    if (refusal.errcode !== 'M_ROOM_IN_USE') {
        if (aliasRefused(refusal)) return withoutAlias();
        return { kind: 'retry', reason: `matrix_create_${created.reason}` };
    }
    const found = await guarded('alias', callTimeoutMs, (signal) =>
        matrix.resolveRoomAlias(noticeRoomAlias(mxid), { signal, cache: false })
    );
    if (!stillPending(key)) return RECIPIENT_GONE;
    if (!found.ok) return { kind: 'retry', reason: `matrix_alias_${found.reason}` };
    const bot = await guarded('whoami', callTimeoutMs, (signal) => matrix.botUserId({ signal }));
    if (!stillPending(key)) return RECIPIENT_GONE;
    // No id (no homeserver configured, which the create would already have
    // answered) matches no creator, so the room is not taken as the bot's.
    const room = await checkRoom(
        found.roomId,
        current,
        mxid,
        matrix,
        callTimeoutMs,
        clock,
        bot ?? ''
    );
    if (room.kind === 'unusable') return withoutAlias();
    if (room.kind !== 'ok') return room;
    return { roomId: found.roomId };
};

/** Of two recorded rooms, the one whose row was written later (the mirror's on a tie). */
const newer = (
    mine: { roomId: string; updatedAt: string } | undefined,
    stored: { roomId: string; updatedAt: string } | undefined
): { roomId: string; updatedAt: string } | undefined =>
    !mine || (stored && Date.parse(stored.updatedAt) > Date.parse(mine.updatedAt)) ? stored : mine;

/**
 * Find or make the person's standing room, and make sure they are invited or
 * in it. Under the recipient's slot, with the row read again first, and again
 * after each homeserver call: a row that a deletion ended while a call was in
 * flight gets nothing recorded on it (not the room made for it, not the
 * re-invite), and the notice ends as `recipient_gone` without a send. A room
 * no row knows is made, or found through the person's alias, by `makeRoom`.
 */
const resolveRoom = async (
    notice: DeadmanReleaseNoticeRecord,
    mxid: string,
    matrix: MatrixForNotices,
    callTimeoutMs: number,
    clock: () => number,
    recorded: { roomId: string; updatedAt: string } | undefined
): Promise<{ roomId: string } | Step> => {
    const key = { switchId: notice.switchId, recipientAccountId: notice.recipientAccountId };
    // Read again: a notice for the same person that held the slot before this
    // one may have made or replaced the room meanwhile, and a deletion may
    // have ended the row while this one waited for the slot.
    const current = stillPending(key);
    if (!current) return RECIPIENT_GONE;
    // The person's room: this row's, or else the newest one any row of
    // theirs records, in this process's mirror (read now, so a room another
    // notice of theirs made while this one waited for the slot counts) or in
    // the database (`recorded`, read at the attempt's start: round 8 of part
    // 2's review, a new leader whose mirror lacked the room the old leader
    // recorded on another of the person's notices made them a second room).
    let roomId =
        current.roomId ??
        newer(db.newestDeadmanNoticeRoom(notice.recipientAccountId), recorded)?.roomId;
    let deadRoom: string | undefined;
    if (roomId) {
        const known = await checkRoom(roomId, current, mxid, matrix, callTimeoutMs, clock);
        if (known.kind === 'unusable') {
            // The room is gone (purged, say): make another, below.
            deadRoom = roomId;
            roomId = undefined;
        } else if (known.kind !== 'ok') {
            return known;
        }
    }
    if (!roomId) {
        const made = await makeRoom(current, mxid, matrix, callTimeoutMs, clock);
        if (!('roomId' in made)) return made;
        roomId = made.roomId;
        // Recorded before the send, so a crash here does not make a second
        // room. Every write here is conditional (`updateDeadmanReleaseNoticeIf`):
        // in Postgres it lands only on a row still as this process read it.
        db.updateDeadmanReleaseNoticeIf(
            key.switchId,
            key.recipientAccountId,
            { status: 'pending' },
            { roomId }
        );
        if (deadRoom) {
            // Every row of this person's that still points at the room the
            // homeserver no longer has moves to the replacement, so a later
            // notice does not replace it again; a row whose room a deletion
            // forgot meanwhile is not given one back.
            for (const row of db.listDeadmanReleaseNoticesForRecipient(notice.recipientAccountId)) {
                if (row.roomId === deadRoom) {
                    db.updateDeadmanReleaseNoticeIf(
                        row.switchId,
                        row.recipientAccountId,
                        { roomId: deadRoom },
                        { roomId }
                    );
                }
            }
        }
    } else if (current.roomId !== roomId) {
        db.updateDeadmanReleaseNoticeIf(
            key.switchId,
            key.recipientAccountId,
            { status: 'pending' },
            { roomId }
        );
    }
    return { roomId };
};

/**
 * One notice: find or make the room, make sure the person is invited or in
 * it, send. Every homeserver failure is a retry; only a missing recipient or
 * release ends the notice.
 */
const attempt = async (
    notice: DeadmanReleaseNoticeRecord,
    record: DeadmanSwitchRecord,
    matrix: MatrixForNotices,
    callTimeoutMs: number,
    clock: () => number
): Promise<Step> => {
    const wrap = db.getDeadmanReleaseWrap(notice.switchId, notice.recipientAccountId);
    const mxid = matrixUserIdFor(notice.recipientAccountId);
    if (!wrap || !wrapIsHeld(wrap) || !mxid) return RECIPIENT_GONE;
    // From the database itself, before anything is asked of the homeserver:
    // nothing is asked for an account already deleted, or for a notice
    // another process already sent or set to retry later; and the person's
    // newest recorded room, for `resolveRoom`.
    const first = await readDatabase(notice, callTimeoutMs, { personsRoom: true });
    const stop = judgeCommitted(notice, first, clock);
    if (stop) return stop;

    const room = await withRoomSlot(notice.recipientAccountId, () =>
        resolveRoom(notice, mxid, matrix, callTimeoutMs, clock, first.room)
    );
    if (!('roomId' in room)) return room;

    // Again right before the send: a deletion committed while the room was
    // being found or made, or another process sent it meanwhile.
    const late = await checkDatabase(notice, callTimeoutMs, clock);
    if (late) return late;

    const sent = await guarded('send', callTimeoutMs, (signal) =>
        matrix.sendEvent(room.roomId, noticeContent(record.id), {
            txnId: noticeTxnId(record.id, notice.recipientAccountId),
            signal,
        })
    );
    if (!sent.ok) {
        const reason = 'reason' in sent ? sent.reason : `status_${sent.status}`;
        return { kind: 'retry', reason: `matrix_send_${reason}` };
    }
    return { kind: 'sent' };
};

/**
 * Whether a notice row is for a release switch that has not fired yet (a
 * store from a crash between a notice write and the switch's write, say):
 * such a row is left alone, neither sent nor ended, until the switch fires.
 */
const awaitsTrigger = (record: DeadmanSwitchRecord | undefined): boolean =>
    record !== undefined &&
    isReleaseSwitch(record) &&
    record.status !== 'cancelled' &&
    record.encryptedPayload !== '' &&
    !record.releasedAt;

const processOne = async (
    notice: DeadmanReleaseNoticeRecord,
    now: Date,
    matrix: MatrixForNotices,
    callTimeoutMs: number,
    clock: () => number
): Promise<Step> => {
    const record = db.getDeadmanSwitch(notice.switchId);
    // Only a release switch that fired has `releasedAt`; an empty payload is
    // one whose content was removed, which nothing points at any more; a
    // cancelled switch, or a legacy one, was never released this way.
    if (!record || !record.releasedAt || record.encryptedPayload === '') {
        return { kind: 'failed', reason: 'release_unavailable' };
    }
    const releasedAt = Date.parse(record.releasedAt);
    if (now.getTime() - releasedAt > NOTICE_RETRY_WINDOW_MS) {
        return { kind: 'failed', reason: 'retry_window_over' };
    }
    try {
        return await attempt(notice, record, matrix, callTimeoutMs, clock);
    } catch (err) {
        if (err instanceof NoticeCallThrew) return err.step;
        // Not a homeserver call: still this notice's failure, not the tick's.
        log.warn('deadman_release_notice_threw', { error: String(err) });
        return { kind: 'retry', reason: 'notifier_threw' };
    }
};

/**
 * One pass: write the rows a fired release switch lacks, then send every due
 * notice, oldest first, up to `NOTICES_PER_TICK`. Failures are isolated per
 * notice and recorded on its row; nothing here throws for one bad notice.
 */
export const runDeadmanReleaseNotifier = async (
    options: { now?: Date; matrix?: MatrixForNotices; callTimeoutMs?: number } = {}
): Promise<NotifierResult> => {
    const now = options.now ?? new Date();
    // The tick's clock: `now` moved on by the time the tick has taken. A
    // retry is timed from when its step is recorded, not from the tick's
    // start, so a notice whose attempt came late in a long tick (behind a call
    // that ran to its timeout, say) still waits a whole backoff before its
    // next one (round 5 of part 2's review: timed from the start, the second
    // look at an alias room could come seconds after the first).
    const startedAt = Date.now();
    const clock = (): number => now.getTime() + (Date.now() - startedAt);
    const matrix = options.matrix ?? matrixClient;
    const callTimeoutMs = options.callTimeoutMs ?? NOTICE_CALL_TIMEOUT_MS;
    const generation = stopGeneration;
    const result: NotifierResult = {
        caughtUp: 0,
        due: 0,
        sent: 0,
        retried: 0,
        failed: 0,
        elsewhere: 0,
    };

    // Catch-up: a crash between a trigger's status write and its rows loses
    // nothing, since a fired release switch with a held copy and no row is
    // treated as due (§5, "Sending it"). The copies are listed by switch, an
    // indexed lookup, so this costs every switch row once and the fired
    // switches' copies. A row is written only where the mirror has none, and
    // in Postgres only where the table has none either, so a leader that has
    // not yet heard of a row the old one sent does not set it back to pending
    // there (round 6 of part 2's review); its own mirror then reads it
    // pending and due, and `checkDatabase` reads it as Postgres has it before
    // anything is sent (round 7) or attempted at all: a retry Postgres has
    // for later is left for that time (round 8).
    for (const record of db.listAllDeadmanSwitches()) {
        if (!record.releasedAt || record.encryptedPayload === '') continue;
        result.caughtUp += writeReleaseNotices(record, record.releasedAt);
    }

    const due = db
        .listDueDeadmanReleaseNotices(now.toISOString())
        // A row for a release switch that has not fired is not due: left alone.
        .filter((notice) => !awaitsTrigger(db.getDeadmanSwitch(notice.switchId)))
        .slice(0, NOTICES_PER_TICK);
    result.due = due.length;
    for (const notice of due) {
        if (generation !== stopGeneration) break;
        const key = `${notice.switchId}:${notice.recipientAccountId}`;
        if (inFlight.has(key)) {
            result.elsewhere += 1;
            continue;
        }
        inFlight.add(key);
        try {
            const step = await processOne(notice, now, matrix, callTimeoutMs, clock);
            const at = new Date().toISOString();
            // The row, read again before anything is written to it: a deletion
            // that landed while this notice was in flight has ended the row
            // (`recipient_gone`), and that stands whatever the step was; a row
            // ended any other way meanwhile is left as it is, so no later
            // error, attempt or backoff is written over the reason it ended.
            // It is counted as it ended: one another process sent is not this
            // tick's failure (round 4 of part 2's review). That read is this
            // process's mirror; in Postgres each write below also carries the
            // condition into the database (`updateDeadmanReleaseNoticeIf`), so
            // a deletion another process committed before this one saw it is
            // not written over either (round 5).
            const ended = db.getDeadmanReleaseNotice(notice.switchId, notice.recipientAccountId);
            const pending = { status: 'pending' } as const;
            if (!ended || ended.status !== 'pending') {
                if (ended?.status === 'sent') result.elsewhere += 1;
                else result.failed += 1;
            } else if (step.kind === 'ended') {
                // The database has it ended or sent; the mirror kept its own
                // row (this process wrote it during the read). Nothing written.
                if (step.status === 'sent') result.elsewhere += 1;
                else result.failed += 1;
            } else if (step.kind === 'notDue') {
                // Another process's retry, set for later: nothing written.
                result.elsewhere += 1;
            } else if (step.kind === 'sent') {
                // The account, read again: one gone another way ends it here.
                if (!db.getUserById(notice.recipientAccountId)) {
                    db.updateDeadmanReleaseNoticeIf(
                        notice.switchId,
                        notice.recipientAccountId,
                        pending,
                        {
                            status: 'failed',
                            failedAt: at,
                            lastError: 'recipient_gone',
                            roomId: undefined,
                        }
                    );
                    result.failed += 1;
                } else {
                    db.updateDeadmanReleaseNoticeIf(
                        notice.switchId,
                        notice.recipientAccountId,
                        pending,
                        {
                            status: 'sent',
                            // The row as read now, which the database's may
                            // have replaced (`checkDatabase`).
                            attempts: ended.attempts + 1,
                            sentAt: at,
                            lastError: undefined,
                        }
                    );
                    result.sent += 1;
                }
            } else if (step.kind === 'retry') {
                const attempts = ended.attempts + 1;
                db.updateDeadmanReleaseNoticeIf(
                    notice.switchId,
                    notice.recipientAccountId,
                    pending,
                    {
                        attempts,
                        lastError: step.reason,
                        nextAttemptAt: new Date(clock() + noticeBackoffMs(attempts)).toISOString(),
                    }
                );
                result.retried += 1;
            } else {
                db.updateDeadmanReleaseNoticeIf(
                    notice.switchId,
                    notice.recipientAccountId,
                    pending,
                    {
                        status: 'failed',
                        failedAt: at,
                        lastError: step.reason,
                        // A notice that ends for a recipient who is gone forgets
                        // the room that tied the account to a Matrix id.
                        ...(step.reason === 'recipient_gone' ? { roomId: undefined } : {}),
                    }
                );
                result.failed += 1;
            }
        } finally {
            inFlight.delete(key);
        }
    }

    if (result.caughtUp + result.due > 0) {
        // Counts only: never who, never where. (The two warnings above carry
        // a thrown error's message beside them, nothing else.)
        log.info('deadman_release_notices_tick', { ...result });
    }
    return result;
};

/**
 * Start the periodic notifier. Idempotent: repeat calls return the same stop
 * handle. The timer is `.unref()`'d so it never keeps the process alive alone.
 * A tick that outlives the interval is not overlapped by the next one (as
 * `authRowsPruneScheduler.ts` does): the tick is asynchronous, so without this
 * a slow homeserver would stack ticks. The other side of that: a slow tick
 * holds every due notice behind it, which is why each homeserver call and
 * each database read it makes for a notice is bounded by
 * `NOTICE_CALL_TIMEOUT_MS` (the header says what that leaves). The catch-up
 * and the due list read only this process's mirror.
 */
export const startDeadmanReleaseNotifier = (
    intervalMs: number = DEFAULT_INTERVAL_MS
): { stop: () => void } => {
    if (timer) return { stop: stopDeadmanReleaseNotifier };
    timer = setInterval(() => {
        if (running) return;
        running = true;
        void trackBackgroundTick(runDeadmanReleaseNotifier())
            .catch((err) => {
                log.warn('deadman_release_notifier_tick_threw', { error: String(err) });
            })
            .finally(() => {
                running = false;
            });
    }, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    return { stop: stopDeadmanReleaseNotifier };
};

export const stopDeadmanReleaseNotifier = (): void => {
    stopGeneration += 1;
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
};

export const isDeadmanReleaseNotifierRunning = (): boolean => timer !== null;
