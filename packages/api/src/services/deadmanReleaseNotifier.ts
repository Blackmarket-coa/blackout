/**
 * The release notifier: sends the bot's notice to each recipient of a fired
 * release switch (`docs/security/deadman-release-design-2026-10-24.md` §5;
 * `release-envelope-2026-10-26.md` §11).
 *
 * The sweep writes one `deadman_release_notices` row per recipient as it
 * fires a release switch; this loop, beside it, sends them. Each notice is an
 * `m.text` in the recipient's standing "Blackout notices" room, a room the
 * bot creates once per account, with the person invited as a direct message
 * and power levels under which only the bot posts or invites. The room is
 * **not end-to-end encrypted**, and is made so deliberately: the bot is a
 * plain HTTP client with no Megolm implementation and cannot encrypt, so the
 * notice is plaintext whatever the room's state says, and a room whose state
 * says "encrypted" around a plaintext post would overstate what the room is.
 * The homeserver's backstop (`encryption_enabled_by_default_for_room_type:
 * invite`, set by every in-repo template) adds `m.room.encryption` to every
 * `private_chat` room after the client's `initial_state`, so the room is
 * created with the `public_chat` preset, which that setting leaves alone, and
 * an explicit invite-only join rule in `initial_state`, which Synapse sends
 * in place of the preset's public one (`handlers/room.py`,
 * `_send_events_for_new_room`); its visibility is `private`, so it is in no
 * directory. `public_chat` also sends no `m.room.guest_access` event (guests
 * cannot join, which is wanted) and leaves the power to invite at 50, which
 * the override sets anyway. Under `all`, which no template sets, the
 * backstop would encrypt this preset too. The notice carries a fixed body and
 * a pointer to the release id, and nothing else: not the owner, not the
 * label, not anyone else named, no time, no content. An `m.notice` would be
 * silent under `.m.rule.suppress_notices`.
 *
 * What "sent" means: the homeserver accepted the event. Whether it reaches
 * the person is the homeserver's (and their client's) business; the release
 * itself is the API's own store, and the app's "Released to you" view works
 * without a notice. A failed or thrown homeserver call is that notice's
 * attempt, retried with backoff (30 s, doubling to 6 h) for 30 days from the
 * release, then recorded as failed for the operator; a recipient whose
 * account is gone, or a release that is not there to point at (cancelled,
 * removed, never a release), ends the notice at once. A row for a release
 * switch that has not fired yet (a store from a crash) is left alone until it
 * does. A person who left or declined their room is invited again, at most
 * once per notice. Logs carry counts only.
 *
 * One room per person: a per-recipient slot serialises finding or making the
 * room, and a notice that waited for the slot reads the room again before
 * deciding, so two notices for one person in overlapping ticks make one room;
 * the interval's tick does not start while the previous one runs. When the
 * homeserver no longer has a person's room, the replacement is recorded on
 * every one of their rows that pointed at the old one. The row is read again
 * after every homeserver call and before anything is written to it: a
 * deletion that landed while the room was being found or made, or during the
 * send, has already ended the row with `recipient_gone`, and that stands
 * whatever the call answered (no room is recorded on it, no re-invite, no
 * send, no attempt, no later error over its reason); a row ended any other
 * way meanwhile is left as it is.
 *
 * Each homeserver call has `NOTICE_CALL_TIMEOUT_MS` to answer; one that does
 * not is that notice's retry (`matrix_<call>_timeout`) and its request is
 * aborted. Without that, one connection the homeserver accepted and never
 * answered would hold the tick, and with it every other due notice, for
 * undici's default of five minutes, since the ticks do not overlap. A tick is
 * still a sequence: 50 notices whose every call times out take about 25
 * minutes, and the worker's shutdown waits for a tick in flight only up to
 * its own bound (`backgroundTicks.ts`).
 *
 * Matrix transaction id `deadman-release-<switch>-<recipient>`, so a resend
 * soon after a crash is deduplicated (the homeserver keeps transaction ids
 * for a while, not for ever). Not through `botPostingGate.ts`: this is the
 * bot's own post into its own room, not a post in a user's name.
 */
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
import { trackBackgroundTick } from './backgroundTicks';
import { isReleaseSwitch, wrapIsHeld, writeReleaseNotices } from './deadmanReleases';
import { matrixUserIdFor } from './userIdentity';

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

/** Why a notice stopped being retried before the window closed. */
export type NoticeTerminalReason = 'recipient_gone' | 'release_unavailable' | 'retry_window_over';

/** The wait before attempt `attempts + 1`, given `attempts` so far. */
export const noticeBackoffMs = (attempts: number): number =>
    Math.min(NOTICE_BACKOFF_FIRST_MS * 2 ** Math.max(0, attempts - 1), NOTICE_BACKOFF_MAX_MS);

/** The homeserver calls the notifier makes, so a test can hand it a stand-in. */
export type MatrixForNotices = Pick<
    typeof matrixClient,
    'createRoom' | 'getRoomStateAdmin' | 'inviteToRoom' | 'sendEvent'
>;

export interface NotifierResult {
    /** Rows written for fired release switches that lacked them (a crash between trigger and rows). */
    caughtUp: number;
    /** Notices that were due this tick. */
    due: number;
    /** Accepted by the homeserver. */
    sent: number;
    /** Failed this tick and left pending for a later attempt. */
    retried: number;
    /** Ended without a send: the window closed, the recipient is gone, or the release is not there. */
    failed: number;
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
    | { kind: 'failed'; reason: string };

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

/** The recipient is gone: the row was ended meanwhile, and nothing more is recorded on it. */
const RECIPIENT_GONE: Step = { kind: 'failed', reason: 'recipient_gone' };

/** Whether the person is in the room or invited to it, from the room's current state. */
const membershipOf = (
    state: Array<{ type: string; state_key?: string; content?: Record<string, unknown> }>,
    userId: string
): string | undefined => {
    const event = state.find((e) => e.type === 'm.room.member' && e.state_key === userId);
    const membership = event?.content?.membership;
    return typeof membership === 'string' ? membership : undefined;
};

/**
 * Find or make the person's standing room, and make sure they are invited or
 * in it. Under the recipient's slot, with the row read again first, and again
 * after each homeserver call: a row that a deletion ended while a call was in
 * flight gets nothing recorded on it (not the room made for it, not the
 * re-invite), and the notice ends as `recipient_gone` without a send.
 */
const resolveRoom = async (
    notice: DeadmanReleaseNoticeRecord,
    mxid: string,
    matrix: MatrixForNotices,
    callTimeoutMs: number
): Promise<{ roomId: string } | Step> => {
    const key = { switchId: notice.switchId, recipientAccountId: notice.recipientAccountId };
    // Read again: a notice for the same person that held the slot before this
    // one may have made or replaced the room meanwhile, and a deletion may
    // have ended the row while this one waited for the slot.
    const current = stillPending(key);
    if (!current) return RECIPIENT_GONE;
    let roomId = current.roomId ?? db.findDeadmanNoticeRoom(notice.recipientAccountId);
    let deadRoom: string | undefined;
    if (roomId) {
        const state = await guarded('state', callTimeoutMs, (signal) =>
            matrix.getRoomStateAdmin(roomId!, { signal })
        );
        if (!stillPending(key)) return RECIPIENT_GONE;
        if (!state.ok) {
            if ('status' in state && state.status === 404) {
                // The room is gone (purged, say): make another, below.
                deadRoom = roomId;
                roomId = undefined;
            } else {
                return { kind: 'retry', reason: `matrix_state_${state.reason}` };
            }
        } else {
            const membership = membershipOf(state.state, mxid);
            if (membership !== 'join' && membership !== 'invite' && !current.reinvitedAt) {
                // Left, declined, or never got the invite: invite again, as a
                // direct message, so the notice has someone to reach. Once per
                // notice: a later attempt of this notice does not invite again.
                const invited = await guarded('invite', callTimeoutMs, (signal) =>
                    matrix.inviteToRoom(roomId!, mxid, undefined, { isDirect: true, signal })
                );
                if (!stillPending(key)) return RECIPIENT_GONE;
                if (!invited.ok) {
                    const reason =
                        'reason' in invited ? invited.reason : `status_${invited.status}`;
                    return { kind: 'retry', reason: `matrix_invite_${reason}` };
                }
                db.updateDeadmanReleaseNotice(key.switchId, key.recipientAccountId, {
                    reinvitedAt: new Date().toISOString(),
                });
            }
        }
    }
    if (!roomId) {
        const created = await guarded('create', callTimeoutMs, (signal) =>
            matrix.createRoom({
                signal,
                name: DEADMAN_NOTICE_ROOM_NAME,
                // Out of every directory, and genuinely unencrypted: see the
                // header for why `public_chat` with an invite-only join rule.
                visibility: 'private',
                preset: 'public_chat',
                encrypted: false,
                initialState: [NOTICE_ROOM_JOIN_RULE],
                invite: [mxid],
                isDirect: true,
                // Only the bot (the creator, at 100) posts or invites; the person
                // joins at 0 and cannot type there.
                powerLevelOverride: { events_default: 50, invite: 50 },
            })
        );
        // The row, read again before the room is recorded on it: a deletion
        // that landed during the create has ended it and forgotten its rooms,
        // and this one is not written back (the room itself stands, empty).
        if (!stillPending(key)) return RECIPIENT_GONE;
        if (!created.ok) return { kind: 'retry', reason: `matrix_create_${created.reason}` };
        roomId = created.roomId;
        // Recorded before the send, so a crash here does not make a second room.
        db.updateDeadmanReleaseNotice(key.switchId, key.recipientAccountId, { roomId });
        if (deadRoom) {
            // Every row of this person's that still points at the room the
            // homeserver no longer has moves to the replacement, so a later
            // notice does not replace it again.
            for (const row of db.listDeadmanReleaseNoticesForRecipient(notice.recipientAccountId)) {
                if (row.roomId === deadRoom) {
                    db.updateDeadmanReleaseNotice(row.switchId, row.recipientAccountId, { roomId });
                }
            }
        }
    } else if (current.roomId !== roomId) {
        db.updateDeadmanReleaseNotice(key.switchId, key.recipientAccountId, { roomId });
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
    callTimeoutMs: number
): Promise<Step> => {
    const wrap = db.getDeadmanReleaseWrap(notice.switchId, notice.recipientAccountId);
    const mxid = matrixUserIdFor(notice.recipientAccountId);
    if (!wrap || !wrapIsHeld(wrap) || !mxid) return RECIPIENT_GONE;

    const room = await withRoomSlot(notice.recipientAccountId, () =>
        resolveRoom(notice, mxid, matrix, callTimeoutMs)
    );
    if (!('roomId' in room)) return room;

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
    callTimeoutMs: number
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
        return await attempt(notice, record, matrix, callTimeoutMs);
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
    const matrix = options.matrix ?? matrixClient;
    const callTimeoutMs = options.callTimeoutMs ?? NOTICE_CALL_TIMEOUT_MS;
    const generation = stopGeneration;
    const result: NotifierResult = { caughtUp: 0, due: 0, sent: 0, retried: 0, failed: 0 };

    // Catch-up: a crash between a trigger's status write and its rows loses
    // nothing, since a fired release switch with a held copy and no row is
    // treated as due (§5, "Sending it"). The copies are listed by switch, an
    // indexed lookup, so this costs the fired switches and their copies.
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
        if (inFlight.has(key)) continue;
        inFlight.add(key);
        try {
            const step = await processOne(notice, now, matrix, callTimeoutMs);
            const at = new Date().toISOString();
            // The row, read again before anything is written to it: a deletion
            // that landed while this notice was in flight has ended the row
            // (`recipient_gone`), and that stands whatever the step was; a row
            // ended any other way meanwhile is left as it is, so no later
            // error, attempt or backoff is written over the reason it ended.
            if (!stillPending(notice)) {
                result.failed += 1;
            } else if (step.kind === 'sent') {
                // The account, read again: one gone another way ends it here.
                if (!db.getUserById(notice.recipientAccountId)) {
                    db.updateDeadmanReleaseNotice(notice.switchId, notice.recipientAccountId, {
                        status: 'failed',
                        failedAt: at,
                        lastError: 'recipient_gone',
                        roomId: undefined,
                    });
                    result.failed += 1;
                } else {
                    db.updateDeadmanReleaseNotice(notice.switchId, notice.recipientAccountId, {
                        status: 'sent',
                        attempts: notice.attempts + 1,
                        sentAt: at,
                        lastError: undefined,
                    });
                    result.sent += 1;
                }
            } else if (step.kind === 'retry') {
                const attempts = notice.attempts + 1;
                db.updateDeadmanReleaseNotice(notice.switchId, notice.recipientAccountId, {
                    attempts,
                    lastError: step.reason,
                    nextAttemptAt: new Date(
                        now.getTime() + noticeBackoffMs(attempts)
                    ).toISOString(),
                });
                result.retried += 1;
            } else {
                db.updateDeadmanReleaseNotice(notice.switchId, notice.recipientAccountId, {
                    status: 'failed',
                    failedAt: at,
                    lastError: step.reason,
                    // A notice that ends for a recipient who is gone forgets
                    // the room that tied the account to a Matrix id.
                    ...(step.reason === 'recipient_gone' ? { roomId: undefined } : {}),
                });
                result.failed += 1;
            }
        } finally {
            inFlight.delete(key);
        }
    }

    if (result.caughtUp + result.due > 0) {
        // Counts only: never who, never where.
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
 * holds every due notice behind it, which is why each call it makes is bounded
 * by `NOTICE_CALL_TIMEOUT_MS` (the header says what that leaves).
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
