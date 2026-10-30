/**
 * The release notices (`docs/security/deadman-release-design-2026-10-24.md`
 * §5; `release-envelope-2026-10-26.md` §11): the sweep writes one row per
 * recipient with the trigger; the notifier makes the recipient's standing
 * "Blackout notices" room (the `public_chat` preset with an invite-only join
 * rule, which the homeserver's encryption backstop leaves unencrypted; a
 * direct message; the person unable to post), reuses it, invites the person
 * again if they left, once per notice, and sends one m.text with the fixed
 * body and the pointer, and nothing else; failures and thrown calls are
 * retried with backoff for 30 days and then recorded; a missing recipient or
 * release ends the notice, a switch not yet fired is waited for; a fired
 * switch without rows is caught up; overlapping ticks make one room per
 * person and send nothing twice; a deletion during any homeserver call stands,
 * with nothing written over the ended row; a call that never answers ends at
 * the call timeout as that notice's retry. The homeserver is the test stub:
 * what Synapse does with each call is read in the fork, not run here (the
 * preset's effect on encryption was run against the fork's own code by the
 * independent review, P3b-M1).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';
import { createMatrixStub, memberEvent } from './_fixtures/matrixStub';
import type { ReleaseIdentity, ReleaseKeySet } from '@blackout/protocol';
import type { DeadmanSwitchRecord } from '../src/db/types';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api-test';
process.env.JWT_AUDIENCE = 'blackout-client-test';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.MATRIX_HOMESERVER = 'https://matrix.test.local';
process.env.MATRIX_BOT_TOKEN = 'syt_test_admin_token';
process.env.MATRIX_HOMESERVER_DOMAIN = 'test.local';

const matrix = createMatrixStub({ domain: 'test.local' });
globalThis.fetch = matrix.fetch;

const { db } = await import('../src/db/store');
const protocol = await import('@blackout/protocol');
const { sweepOverdueDeadmanSwitches, recordToOwnerView } = await import('../src/modules/deadman');
const { armReleaseSwitch } = await import('../src/services/deadmanReleases');
const {
    NOTICE_BACKOFF_FIRST_MS,
    NOTICE_BACKOFF_MAX_MS,
    NOTICE_RETRY_WINDOW_MS,
    isDeadmanReleaseNotifierRunning,
    noticeBackoffMs,
    runDeadmanReleaseNotifier,
    startDeadmanReleaseNotifier,
    stopDeadmanReleaseNotifier,
} = await import('../src/services/deadmanReleaseNotifier');
const { computeDeadlines } = await import('../src/services/deadmanScheduler');
const { matrixUserIdFor } = await import('../src/services/userIdentity');
const lifecycle = await import('../src/services/accountLifecycle');

/** Resolve to `pending` if `work` has not settled within `ms`: a bounded wait that fails instead of hanging. */
const within = <T>(ms: number, work: Promise<T>): Promise<T | 'pending'> =>
    Promise.race([
        work,
        new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), ms)),
    ]);

protocol.setKemProvider(protocol.mlKem768Provider);

type User = { id: string; username: string };

const seedUser = (): User => {
    const id = randomUUID();
    const username = `dn-${id.slice(0, 8)}`;
    db.createUser({
        id,
        username,
        email: `${username}@example.com`,
        passwordHash: 'unused',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: 'pk',
    });
    return { id, username };
};

const publish = (keySet: ReleaseKeySet) =>
    db.publishReleaseIdentity({
        id: randomUUID(),
        accountId: keySet.identity.accountId,
        formatVersion: keySet.identity.v,
        signingKey: keySet.identity.signingKey,
        x25519Key: keySet.identity.x25519Key,
        mlkem768Key: keySet.identity.mlkem768Key,
        signature: keySet.identity.signature,
        fingerprint: keySet.fingerprint,
    });

const freshPerson = async (): Promise<{ user: User; keySet: ReleaseKeySet }> => {
    const user = seedUser();
    const keySet = await protocol.createReleaseKeySet(user.id);
    publish(keySet);
    return { user, keySet };
};

const LABEL = 'owner-only label: the red folder';
const MESSAGE = 'Synthetic test text: look under the stairs.';

/** Arm as the route does once the body passed, through the service. */
const armFor = async (
    owner: { user: User; keySet: ReleaseKeySet },
    recipients: ReleaseIdentity[]
): Promise<DeadmanSwitchRecord> => {
    const envelope = await protocol.buildReleaseEnvelope({
        ownerKeySet: owner.keySet,
        recipients,
        message: MESSAGE,
    });
    const outcome = await armReleaseSwitch({
        ownerId: owner.user.id,
        input: { checkInIntervalSeconds: 60, gracePeriodSeconds: 0, label: LABEL, envelope },
    });
    assert.equal(outcome.kind, 'armed', `arming: ${outcome.kind}`);
    return outcome.kind === 'armed' ? outcome.record : (undefined as never);
};

/** Fire every switch due by `at`, with no backlog window. */
const sweepAt = (at: Date) => sweepOverdueDeadmanSwitches(at, Number.MAX_SAFE_INTEGER);
const soon = () => new Date(Date.now() + 200_000);

/** Arm and fire one release to `recipients`; returns the record and when it fired. */
const released = async (
    owner: { user: User; keySet: ReleaseKeySet },
    recipients: ReleaseIdentity[],
    at: Date = soon()
) => {
    const record = await armFor(owner, recipients);
    sweepAt(at);
    const fired = db.getDeadmanSwitch(record.id)!;
    assert.equal(fired.status, 'triggered');
    return { record: fired, at };
};

const seedLegacy = (owner: User, recipients: string[]) => {
    const lastCheckInAt = new Date().toISOString();
    const { triggerAt, releaseAt } = computeDeadlines({
        lastCheckInAt,
        checkInIntervalSeconds: 60,
        gracePeriodSeconds: 0,
    });
    return db.createDeadmanSwitch({
        id: randomUUID(),
        ownerId: owner.id,
        roomId: '!legacy:example.org',
        status: 'armed',
        checkInIntervalSeconds: 60,
        gracePeriodSeconds: 0,
        lastCheckInAt,
        triggerAt,
        releaseAt,
        recipients,
        encryptedPayload: 'sealed-legacy',
    });
};

const POINTER = 'co.bmc.deadman.release';
const BODY =
    "There is something new for you in Blackout. Open Blackout to see it. This room is not end-to-end encrypted, so please don't reply here.";

const roomStateOf = (roomId: string) => {
    const room = matrix.rooms.get(roomId);
    assert.ok(Array.isArray(room), `room ${roomId} exists on the stub`);
    return room;
};

const setMembership = (roomId: string, userId: string, membership: string) => {
    const rest = roomStateOf(roomId).filter(
        (e) => !(e.type === 'm.room.member' && e.state_key === userId)
    );
    matrix.rooms.set(roomId, [...rest, memberEvent(userId, membership)]);
};

// One recipient for the room tests, so the room is reused across releases.
const bob = await freshPerson();
const bobMxid = matrixUserIdFor(bob.user.id)!;

test('the sweep writes one pending notice per recipient with the trigger, none for the owner, none for a legacy switch', async () => {
    const owner = await freshPerson();
    const alice = await freshPerson();
    const carol = await freshPerson();
    const legacy = seedLegacy(owner.user, [alice.user.id]);
    const record = await armFor(owner, [alice.keySet.identity, carol.keySet.identity]);
    assert.equal(db.listDeadmanReleaseNotices(record.id).length, 0, 'nothing before the trigger');

    const at = soon();
    sweepAt(at);
    const notices = db.listDeadmanReleaseNotices(record.id);
    assert.deepEqual(
        notices.map((n) => n.recipientAccountId).sort(),
        [alice.user.id, carol.user.id].sort()
    );
    for (const notice of notices) {
        assert.equal(notice.status, 'pending');
        assert.equal(notice.attempts, 0);
        assert.equal(notice.nextAttemptAt, at.toISOString(), 'due with the release');
        assert.equal(notice.roomId, undefined);
        assert.equal(notice.lastError, undefined);
    }
    assert.equal(db.getDeadmanReleaseNotice(record.id, owner.user.id), undefined);
    assert.equal(db.getDeadmanSwitch(legacy.id)?.status, 'triggered');
    assert.equal(db.listDeadmanReleaseNotices(legacy.id).length, 0);
    assert.deepEqual(recordToOwnerView(db.getDeadmanSwitch(record.id)!).notices, {
        total: 2,
        sent: 0,
        pending: 2,
        failed: 0,
    });
    // The sweep writes each row once.
    sweepAt(new Date(at.getTime() + 60_000));
    assert.equal(db.listDeadmanReleaseNotices(record.id).length, 2);
    // Sent, so that the later tests start with nothing due.
    assert.equal((await runDeadmanReleaseNotifier({ now: at })).sent, 2);
});

test('the notifier makes a direct room the homeserver’s backstop leaves unencrypted (public_chat, invite-only) that the person cannot post in, and sends one m.text with the fixed body and the pointer, nothing else', async () => {
    matrix.clearCalls();
    const owner = await freshPerson();
    const carol = await freshPerson();
    const carolMxid = matrixUserIdFor(carol.user.id)!;
    const { record, at } = await released(owner, [bob.keySet.identity, carol.keySet.identity]);

    const result = await runDeadmanReleaseNotifier({ now: at });
    assert.deepEqual(result, { caughtUp: 0, due: 2, sent: 2, retried: 0, failed: 0 });

    assert.equal(matrix.creates.length, 2, 'one room per recipient');
    const bobsRoom = matrix.creates.find((c) => (c.body.invite as string[]).includes(bobMxid))!;
    assert.ok(bobsRoom);
    // The exact body. `public_chat` is what keeps the homeserver's
    // `encryption_enabled_by_default_for_room_type: invite` from adding
    // m.room.encryption (it keys on the preset, not the join rule), and the
    // join rule in initial_state is what Synapse sends in place of the
    // preset's public one; `private` keeps it out of the directory.
    assert.deepEqual(bobsRoom.body, {
        visibility: 'private',
        preset: 'public_chat',
        initial_state: [
            { type: 'm.room.join_rules', state_key: '', content: { join_rule: 'invite' } },
        ],
        name: 'Blackout notices',
        power_level_content_override: { events_default: 50, invite: 50 },
        invite: [bobMxid],
        is_direct: true,
    });
    assert.ok(
        !JSON.stringify(bobsRoom.body).includes('m.room.encryption'),
        'no encryption event of the bot’s own either: it cannot encrypt'
    );
    assert.ok(matrix.creates.some((c) => (c.body.invite as string[]).includes(carolMxid)));
    assert.equal(matrix.invites.length, 0, 'the invite travels with the creation');

    const notice = db.getDeadmanReleaseNotice(record.id, bob.user.id)!;
    assert.equal(notice.status, 'sent');
    assert.equal(notice.roomId, bobsRoom.roomId);
    assert.equal(notice.attempts, 1);
    assert.ok(notice.sentAt);
    assert.equal(notice.lastError, undefined);

    const sends = matrix.sendsTo(bobsRoom.roomId);
    assert.equal(sends.length, 1);
    const [send] = sends;
    assert.equal(send.eventType, 'm.room.message');
    assert.equal(send.txnId, `deadman-release-${record.id}-${bob.user.id}`);
    assert.deepEqual(send.body, {
        msgtype: 'm.text',
        body: BODY,
        [POINTER]: { schemaVersion: 1, releaseId: record.id },
    });
    assert.equal(send.body.body, protocol.DEADMAN_NOTICE_BODY);
    assert.deepEqual(protocol.parseDeadmanNoticePointer(send.body[POINTER]), {
        schemaVersion: 1,
        releaseId: record.id,
    });

    // What the notice must never carry (§5): the owner, the label, other
    // people, any time, the word dead-man in the body, anything of the message.
    const raw = send.raw;
    for (const secret of [
        owner.user.id,
        owner.user.username,
        LABEL,
        carol.user.id,
        carolMxid,
        MESSAGE,
        'folder',
        'stairs',
    ]) {
        assert.ok(!raw.includes(secret), `the notice does not carry ${secret}`);
    }
    assert.doesNotMatch(String(send.body.body), /dead-?man/i);
    assert.doesNotMatch(raw, /\d{4}-\d{2}-\d{2}T/, 'no time');
    assert.equal(Object.keys(send.body).length, 3);

    assert.deepEqual(recordToOwnerView(db.getDeadmanSwitch(record.id)!).notices, {
        total: 2,
        sent: 2,
        pending: 0,
        failed: 0,
    });
    assert.ok(
        !JSON.stringify(recordToOwnerView(db.getDeadmanSwitch(record.id)!)).includes(
            bobsRoom.roomId
        ),
        'the owner never sees the notice rooms'
    );

    // Nothing is due any more.
    assert.deepEqual(await runDeadmanReleaseNotifier({ now: at }), {
        caughtUp: 0,
        due: 0,
        sent: 0,
        retried: 0,
        failed: 0,
    });
});

test('a later release to the same person reuses their room, with no new invite while they are invited or joined', async () => {
    matrix.clearCalls();
    const roomId = db.findDeadmanNoticeRoom(bob.user.id)!;
    assert.ok(roomId);
    const second = await released(await freshPerson(), [bob.keySet.identity]);
    const result = await runDeadmanReleaseNotifier({ now: second.at });
    assert.equal(result.sent, 1);
    assert.equal(matrix.creates.length, 0, 'no new room');
    assert.equal(matrix.invites.length, 0, 'still invited: no new invite');
    assert.equal(db.getDeadmanReleaseNotice(second.record.id, bob.user.id)?.roomId, roomId);
    assert.equal(matrix.sendsTo(roomId).length, 1);
    assert.equal(
        matrix.sendsTo(roomId)[0].txnId,
        `deadman-release-${second.record.id}-${bob.user.id}`
    );

    setMembership(roomId, bobMxid, 'join');
    matrix.clearCalls();
    const third = await released(await freshPerson(), [bob.keySet.identity]);
    assert.equal((await runDeadmanReleaseNotifier({ now: third.at })).sent, 1);
    assert.equal(matrix.creates.length, 0);
    assert.equal(matrix.invites.length, 0, 'joined: no new invite');
    assert.equal(matrix.sendsTo(roomId).length, 1);
});

test('a person who left or declined their room is invited again, as a direct message, before the notice', async () => {
    const roomId = db.findDeadmanNoticeRoom(bob.user.id)!;
    setMembership(roomId, bobMxid, 'leave');
    matrix.clearCalls();
    const { record, at } = await released(await freshPerson(), [bob.keySet.identity]);
    assert.equal((await runDeadmanReleaseNotifier({ now: at })).sent, 1);
    assert.equal(matrix.creates.length, 0);
    assert.deepEqual(matrix.invites, [
        { roomId, userId: bobMxid, via: 'state', body: { membership: 'invite', is_direct: true } },
    ]);
    assert.equal(matrix.sendsTo(roomId).length, 1);
    assert.equal(db.getDeadmanReleaseNotice(record.id, bob.user.id)?.status, 'sent');

    // A room the homeserver no longer has is replaced.
    matrix.rooms.delete(roomId);
    matrix.clearCalls();
    const replaced = await released(await freshPerson(), [bob.keySet.identity]);
    assert.equal((await runDeadmanReleaseNotifier({ now: replaced.at })).sent, 1);
    assert.equal(matrix.creates.length, 1);
    const newRoom = matrix.creates[0].roomId;
    assert.notEqual(newRoom, roomId);
    assert.equal(db.getDeadmanReleaseNotice(replaced.record.id, bob.user.id)?.roomId, newRoom);
    assert.equal(db.findDeadmanNoticeRoom(bob.user.id), newRoom);
});

test('a homeserver failure is retried with backoff, 30 s doubling to 6 h, and nothing is marked sent until it accepted the event', async () => {
    assert.equal(noticeBackoffMs(1), 30_000);
    assert.equal(noticeBackoffMs(2), 60_000);
    assert.equal(noticeBackoffMs(5), 480_000);
    assert.equal(noticeBackoffMs(11), NOTICE_BACKOFF_MAX_MS);
    assert.equal(noticeBackoffMs(40), NOTICE_BACKOFF_MAX_MS);

    const dave = await freshPerson();
    const { record, at } = await released(await freshPerson(), [dave.keySet.identity]);
    matrix.clearCalls();
    matrix.createStatus = 500;
    try {
        const first = await runDeadmanReleaseNotifier({ now: at });
        assert.deepEqual(first, { caughtUp: 0, due: 1, sent: 0, retried: 1, failed: 0 });
        let notice = db.getDeadmanReleaseNotice(record.id, dave.user.id)!;
        assert.equal(notice.status, 'pending');
        assert.equal(notice.attempts, 1);
        assert.equal(notice.lastError, 'matrix_create_create_rejected');
        assert.equal(notice.roomId, undefined, 'no room was made');
        assert.equal(notice.nextAttemptAt, new Date(at.getTime() + 30_000).toISOString());
        assert.equal(matrix.sends.length, 0);

        // Not due until then.
        const early = await runDeadmanReleaseNotifier({ now: new Date(at.getTime() + 29_000) });
        assert.equal(early.due, 0);
        const second = await runDeadmanReleaseNotifier({ now: new Date(at.getTime() + 30_000) });
        assert.equal(second.retried, 1);
        notice = db.getDeadmanReleaseNotice(record.id, dave.user.id)!;
        assert.equal(notice.attempts, 2);
        assert.equal(notice.nextAttemptAt, new Date(at.getTime() + 90_000).toISOString());
    } finally {
        matrix.createStatus = 200;
    }

    // The room is made, but the send fails.
    matrix.sendStatus = 500;
    try {
        const third = await runDeadmanReleaseNotifier({ now: new Date(at.getTime() + 90_000) });
        assert.equal(third.retried, 1);
        const notice = db.getDeadmanReleaseNotice(record.id, dave.user.id)!;
        assert.equal(notice.attempts, 3);
        assert.equal(notice.lastError, 'matrix_send_status_500');
        assert.ok(notice.roomId, 'the room is recorded before the send');
        assert.equal(notice.status, 'pending');
        assert.equal(notice.nextAttemptAt, new Date(at.getTime() + 90_000 + 120_000).toISOString());
        assert.equal(matrix.creates.length, 1);
    } finally {
        matrix.sendStatus = 200;
    }

    // An invite that fails is a retry too.
    const roomId = db.getDeadmanReleaseNotice(record.id, dave.user.id)!.roomId!;
    setMembership(roomId, matrixUserIdFor(dave.user.id)!, 'leave');
    matrix.inviteStatus = 403;
    // The stub records the send it refused above; nothing more is attempted now.
    const sendsBefore = matrix.sendsTo(roomId).length;
    assert.equal(sendsBefore, 1);
    try {
        const fourth = await runDeadmanReleaseNotifier({ now: new Date(at.getTime() + 210_000) });
        assert.equal(fourth.retried, 1);
        assert.equal(
            db.getDeadmanReleaseNotice(record.id, dave.user.id)?.lastError,
            'matrix_invite_status_403'
        );
        assert.equal(matrix.sendsTo(roomId).length, sendsBefore, 'no send after a failed invite');
    } finally {
        matrix.inviteStatus = 200;
    }

    // Then it goes through, with the same room and the same transaction id.
    const fifth = await runDeadmanReleaseNotifier({
        now: new Date(at.getTime() + 210_000 + 480_000),
    });
    assert.equal(fifth.sent, 1);
    const sent = db.getDeadmanReleaseNotice(record.id, dave.user.id)!;
    assert.equal(sent.status, 'sent');
    assert.equal(sent.attempts, 5);
    assert.equal(sent.lastError, undefined);
    assert.equal(sent.roomId, roomId);
    assert.equal(matrix.creates.length, 1, 'one room in all');
    assert.equal(matrix.sendsTo(roomId).length, 2, 'the refused send, then the accepted one');
    assert.ok(
        matrix
            .sendsTo(roomId)
            .every((s) => s.txnId === `deadman-release-${record.id}-${dave.user.id}`),
        'the same transaction id each time, so the homeserver can deduplicate'
    );
});

test('30 days after the release a notice still pending is recorded as failed, and nothing more is sent', async () => {
    const erin = await freshPerson();
    const { record, at } = await released(await freshPerson(), [erin.keySet.identity]);
    matrix.clearCalls();
    matrix.sendStatus = 500;
    try {
        assert.equal((await runDeadmanReleaseNotifier({ now: at })).retried, 1);
        const lastTry = new Date(at.getTime() + NOTICE_RETRY_WINDOW_MS - 1);
        const stillOpen = await runDeadmanReleaseNotifier({ now: lastTry });
        assert.equal(stillOpen.retried, 1, 'retried until the window closes');
        // Due again after its backoff, which is now past the window.
        const nextDue = db.getDeadmanReleaseNotice(record.id, erin.user.id)!.nextAttemptAt;
        assert.equal(nextDue, new Date(lastTry.getTime() + noticeBackoffMs(2)).toISOString());
        const closed = await runDeadmanReleaseNotifier({ now: new Date(Date.parse(nextDue)) });
        assert.deepEqual(closed, { caughtUp: 0, due: 1, sent: 0, retried: 0, failed: 1 });
    } finally {
        matrix.sendStatus = 200;
    }
    const notice = db.getDeadmanReleaseNotice(record.id, erin.user.id)!;
    assert.equal(notice.status, 'failed');
    assert.equal(notice.lastError, 'retry_window_over');
    assert.ok(notice.failedAt);
    assert.equal(
        matrix.sends.filter((s) => s.txnId.includes(record.id)).length,
        2,
        'two refused sends, then none'
    );
    assert.deepEqual(recordToOwnerView(db.getDeadmanSwitch(record.id)!).notices, {
        total: 1,
        sent: 0,
        pending: 0,
        failed: 1,
    });
    // Never again.
    const later = await runDeadmanReleaseNotifier({
        now: new Date(at.getTime() + 2 * NOTICE_RETRY_WINDOW_MS),
    });
    assert.equal(later.due, 0);
});

test('a fired release switch without its rows is caught up: a crash between the trigger and the rows loses nothing', async () => {
    const frank = await freshPerson();
    const record = await armFor(await freshPerson(), [frank.keySet.identity]);
    const at = soon();
    // The status write landed, the rows did not. Another switch naming Frank
    // is armed and has not fired: it is owed nothing.
    db.updateDeadmanSwitch(record.id, { status: 'triggered', releasedAt: at.toISOString() });
    assert.equal(db.listDeadmanReleaseNotices(record.id).length, 0);
    const armedOnly = await armFor(await freshPerson(), [frank.keySet.identity]);
    matrix.clearCalls();
    const result = await runDeadmanReleaseNotifier({ now: at });
    assert.deepEqual(result, { caughtUp: 1, due: 1, sent: 1, retried: 0, failed: 0 });
    assert.equal(db.getDeadmanReleaseNotice(record.id, frank.user.id)?.status, 'sent');
    assert.equal(
        db.listDeadmanReleaseNotices(armedOnly.id).length,
        0,
        'nothing for an unfired switch'
    );
    assert.equal(matrix.creates.length, 1);
    // A legacy switch, a cancelled release and one whose content was removed are not.
    const owner = await freshPerson();
    seedLegacy(owner.user, [frank.user.id]);
    const removed = await armFor(owner, [frank.keySet.identity]);
    db.updateDeadmanSwitch(removed.id, {
        status: 'triggered',
        releasedAt: at.toISOString(),
        encryptedPayload: '',
    });
    sweepAt(at);
    assert.equal((await runDeadmanReleaseNotifier({ now: at })).caughtUp, 0);
    assert.equal(db.listDeadmanReleaseNotices(removed.id).length, 0);
});

test('a notice for a recipient who is gone, or for a release that is not there, ends at once and sends nothing', async () => {
    const gone = await freshPerson();
    const { record, at } = await released(await freshPerson(), [gone.keySet.identity]);
    db.updateDeadmanReleaseNotice(record.id, gone.user.id, { roomId: '!old:test.local' });
    db.deleteUser(gone.user.id);
    matrix.clearCalls();
    const result = await runDeadmanReleaseNotifier({ now: at });
    assert.deepEqual(result, { caughtUp: 0, due: 1, sent: 0, retried: 0, failed: 1 });
    const notice = db.getDeadmanReleaseNotice(record.id, gone.user.id)!;
    assert.equal(notice.status, 'failed');
    assert.equal(notice.lastError, 'recipient_gone');
    assert.equal(
        notice.roomId,
        undefined,
        'the room that tied the account to a Matrix id is forgotten'
    );
    assert.equal(matrix.creates.length + matrix.sends.length + matrix.invites.length, 0);

    // A row whose switch was cancelled, and one whose switch is a legacy
    // switch: never a release, so the notice ends.
    const grace = await freshPerson();
    const cancelled = await armFor(await freshPerson(), [grace.keySet.identity]);
    db.createDeadmanReleaseNotice({
        switchId: cancelled.id,
        recipientAccountId: grace.user.id,
        nextAttemptAt: at.toISOString(),
    });
    // Cancelled with its content still there (a store from before cancel
    // blanked it): still never a release to point at.
    db.updateDeadmanSwitch(cancelled.id, { status: 'cancelled' });
    const legacy = seedLegacy((await freshPerson()).user, [grace.user.id]);
    db.createDeadmanReleaseNotice({
        switchId: legacy.id,
        recipientAccountId: grace.user.id,
        nextAttemptAt: at.toISOString(),
    });
    const second = await runDeadmanReleaseNotifier({ now: at });
    assert.deepEqual(second, { caughtUp: 0, due: 2, sent: 0, retried: 0, failed: 2 });
    for (const id of [cancelled.id, legacy.id]) {
        assert.equal(db.getDeadmanReleaseNotice(id, grace.user.id)?.status, 'failed');
        assert.equal(
            db.getDeadmanReleaseNotice(id, grace.user.id)?.lastError,
            'release_unavailable'
        );
    }
    assert.equal(matrix.sends.length, 0);
});

test('a notice row for a release switch that has not fired is left alone, and is sent once the switch fires', async () => {
    // A store from a crash between a notice's write and the switch's: the row
    // exists before the trigger. It is not due and not ended; when the sweep
    // fires the switch it is the row the trigger would have written.
    const heidi = await freshPerson();
    const armed = await armFor(await freshPerson(), [heidi.keySet.identity]);
    const at = soon();
    db.createDeadmanReleaseNotice({
        switchId: armed.id,
        recipientAccountId: heidi.user.id,
        nextAttemptAt: at.toISOString(),
    });
    matrix.clearCalls();
    const before = await runDeadmanReleaseNotifier({ now: at });
    assert.deepEqual(before, { caughtUp: 0, due: 0, sent: 0, retried: 0, failed: 0 });
    const untouched = db.getDeadmanReleaseNotice(armed.id, heidi.user.id)!;
    assert.equal(untouched.status, 'pending');
    assert.equal(untouched.attempts, 0);
    assert.equal(untouched.lastError, undefined);
    assert.equal(matrix.sends.length + matrix.creates.length, 0);
    assert.deepEqual(recordToOwnerView(db.getDeadmanSwitch(armed.id)!).notices, undefined);

    sweepAt(at);
    assert.equal(db.getDeadmanSwitch(armed.id)?.status, 'triggered');
    assert.equal(
        db.listDeadmanReleaseNotices(armed.id).length,
        1,
        'the trigger wrote no second row'
    );
    const after = await runDeadmanReleaseNotifier({ now: at });
    assert.deepEqual(after, { caughtUp: 0, due: 1, sent: 1, retried: 0, failed: 0 });
    assert.equal(db.getDeadmanReleaseNotice(armed.id, heidi.user.id)?.status, 'sent');
    assert.deepEqual(recordToOwnerView(db.getDeadmanSwitch(armed.id)!).notices, {
        total: 1,
        sent: 1,
        pending: 0,
        failed: 0,
    });
});

test('a homeserver call that throws is that notice’s attempt: counted, backed off, and the tick goes on to the next notice', async () => {
    const dave = await freshPerson();
    const daveMxid = matrixUserIdFor(dave.user.id)!;
    const first = await released(await freshPerson(), [dave.keySet.identity]);
    assert.equal((await runDeadmanReleaseNotifier({ now: first.at })).sent, 1);
    const roomId = db.getDeadmanReleaseNotice(first.record.id, dave.user.id)!.roomId!;
    setMembership(roomId, daveMxid, 'leave');
    // Dave's second notice (older row) and Erin's, due in the same tick.
    const at = new Date(first.at.getTime() + 1000);
    const second = await released(await freshPerson(), [dave.keySet.identity], at);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const erin = await freshPerson();
    const erins = await released(await freshPerson(), [erin.keySet.identity], at);
    matrix.clearCalls();
    const stubFetch = matrix.fetch;
    const throwing = (pattern: string) =>
        (async (input: RequestInfo | URL, init?: RequestInit) => {
            const url =
                typeof input === 'string'
                    ? input
                    : input instanceof URL
                    ? input.toString()
                    : input.url;
            if (url.includes(pattern)) throw new TypeError('fetch failed');
            return stubFetch(input, init);
        }) as typeof fetch;
    // The re-invite throws.
    globalThis.fetch = throwing('/state/m.room.member/');
    try {
        const tick = await runDeadmanReleaseNotifier({ now: at });
        assert.deepEqual(tick, { caughtUp: 0, due: 2, sent: 1, retried: 1, failed: 0 });
    } finally {
        globalThis.fetch = matrix.fetch;
    }
    const daves = db.getDeadmanReleaseNotice(second.record.id, dave.user.id)!;
    assert.equal(daves.status, 'pending');
    assert.equal(daves.attempts, 1);
    assert.equal(daves.lastError, 'matrix_invite_network_error');
    assert.equal(daves.nextAttemptAt, new Date(at.getTime() + 30_000).toISOString());
    assert.equal(daves.reinvitedAt, undefined, 'a thrown invite is not an invite');
    assert.equal(db.getDeadmanReleaseNotice(erins.record.id, erin.user.id)?.status, 'sent');
    assert.equal(matrix.sendsTo(roomId).length, 0, 'no send after the thrown invite');

    // The state read throws; then the room creation throws, for someone new.
    const retryAt = new Date(Date.parse(daves.nextAttemptAt));
    globalThis.fetch = throwing('/_synapse/admin/v1/rooms/');
    try {
        assert.equal((await runDeadmanReleaseNotifier({ now: retryAt })).retried, 1);
    } finally {
        globalThis.fetch = matrix.fetch;
    }
    assert.equal(
        db.getDeadmanReleaseNotice(second.record.id, dave.user.id)?.lastError,
        'matrix_state_network_error'
    );
    const fay = await freshPerson();
    const fays = await released(await freshPerson(), [fay.keySet.identity]);
    globalThis.fetch = throwing('/createRoom');
    try {
        assert.equal((await runDeadmanReleaseNotifier({ now: fays.at })).retried, 1);
    } finally {
        globalThis.fetch = matrix.fetch;
    }
    assert.equal(
        db.getDeadmanReleaseNotice(fays.record.id, fay.user.id)?.lastError,
        'matrix_create_network_error'
    );
    // Then both go through.
    const later = new Date(retryAt.getTime() + 60_000);
    const done = await runDeadmanReleaseNotifier({ now: later });
    assert.equal(done.sent, 2);
    assert.equal(db.getDeadmanReleaseNotice(second.record.id, dave.user.id)?.status, 'sent');
    assert.ok(db.getDeadmanReleaseNotice(second.record.id, dave.user.id)?.reinvitedAt);
});

test('a person who left is invited again at most once per notice: a retry of the same notice does not invite again', async () => {
    const gus = await freshPerson();
    const gusMxid = matrixUserIdFor(gus.user.id)!;
    const first = await released(await freshPerson(), [gus.keySet.identity]);
    assert.equal((await runDeadmanReleaseNotifier({ now: first.at })).sent, 1);
    const roomId = db.getDeadmanReleaseNotice(first.record.id, gus.user.id)!.roomId!;
    setMembership(roomId, gusMxid, 'leave');
    const second = await released(await freshPerson(), [gus.keySet.identity]);
    matrix.clearCalls();
    matrix.sendStatus = 500;
    try {
        assert.equal((await runDeadmanReleaseNotifier({ now: second.at })).retried, 1);
    } finally {
        matrix.sendStatus = 200;
    }
    assert.equal(matrix.invites.length, 1, 'invited again once');
    const row = db.getDeadmanReleaseNotice(second.record.id, gus.user.id)!;
    assert.ok(row.reinvitedAt, 'the invite is recorded on the row');
    // They leave again before the retry; the same notice does not invite again.
    setMembership(roomId, gusMxid, 'leave');
    const retry = await runDeadmanReleaseNotifier({
        now: new Date(Date.parse(row.nextAttemptAt)),
    });
    assert.equal(retry.sent, 1);
    assert.equal(matrix.invites.length, 1, 'no second invite for the same notice');
    assert.equal(matrix.sendsTo(roomId).length, 2);
    // A later notice is a new one, and invites again, once.
    const third = await released(await freshPerson(), [gus.keySet.identity]);
    assert.equal((await runDeadmanReleaseNotifier({ now: third.at })).sent, 1);
    assert.equal(matrix.invites.length, 2);
});

test('a purged room is replaced once per person: every notice row that pointed at it moves to the replacement', async () => {
    const carol = await freshPerson();
    const carolMxid = matrixUserIdFor(carol.user.id)!;
    const a = await released(await freshPerson(), [carol.keySet.identity]);
    matrix.clearCalls();
    assert.equal((await runDeadmanReleaseNotifier({ now: a.at })).sent, 1);
    const roomX = db.getDeadmanReleaseNotice(a.record.id, carol.user.id)!.roomId!;
    // A second notice records room X, but its send is refused: pending, at X.
    const b = await released(
        await freshPerson(),
        [carol.keySet.identity],
        new Date(a.at.getTime() + 1000)
    );
    matrix.sendStatus = 500;
    try {
        assert.equal((await runDeadmanReleaseNotifier({ now: b.at })).retried, 1);
    } finally {
        matrix.sendStatus = 200;
    }
    assert.equal(db.getDeadmanReleaseNotice(b.record.id, carol.user.id)!.roomId, roomX);
    // X is purged. A third notice replaces it...
    matrix.rooms.delete(roomX);
    const c = await released(
        await freshPerson(),
        [carol.keySet.identity],
        new Date(b.at.getTime() + 2000)
    );
    matrix.clearCalls();
    assert.equal((await runDeadmanReleaseNotifier({ now: c.at })).sent, 1);
    const roomY = db.getDeadmanReleaseNotice(c.record.id, carol.user.id)!.roomId!;
    assert.notEqual(roomY, roomX);
    // ...and every row of Carol's that pointed at X points at Y now, so when B
    // comes due it goes to Y and makes no third room.
    assert.equal(db.getDeadmanReleaseNotice(a.record.id, carol.user.id)!.roomId, roomY);
    assert.equal(db.getDeadmanReleaseNotice(b.record.id, carol.user.id)!.roomId, roomY);
    const bDue = new Date(
        Date.parse(db.getDeadmanReleaseNotice(b.record.id, carol.user.id)!.nextAttemptAt)
    );
    assert.equal((await runDeadmanReleaseNotifier({ now: bDue })).sent, 1);
    assert.equal(db.getDeadmanReleaseNotice(b.record.id, carol.user.id)!.roomId, roomY);
    const creates = matrix.creates.filter((x) => (x.body.invite as string[]).includes(carolMxid));
    assert.equal(creates.length, 1, 'one replacement room');
    assert.equal(matrix.sendsTo(roomY).length, 2);
});

test('an account deletion that lands during a send stands: the row stays failed with recipient_gone and is not marked sent', async () => {
    const leaving = await freshPerson();
    const { record, at } = await released(await freshPerson(), [leaving.keySet.identity]);
    matrix.clearCalls();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const stubFetch = matrix.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
            typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/send/')) await gate;
        return stubFetch(input, init);
    }) as typeof fetch;
    try {
        const tick = runDeadmanReleaseNotifier({ now: at });
        await new Promise((resolve) => setTimeout(resolve, 20));
        // The room is made and the send is in flight; the account is deleted.
        assert.ok(db.getDeadmanReleaseNotice(record.id, leaving.user.id)?.roomId);
        const issued = lifecycle.requestAccountDeletion({ userId: leaving.user.id })!;
        assert.equal(lifecycle.confirmAccountDeletion(issued.token, leaving.user.id).kind, 'ok');
        assert.equal(db.getDeadmanReleaseNotice(record.id, leaving.user.id)?.status, 'failed');
        release();
        const result = await within(5000, tick);
        assert.deepEqual(result, { caughtUp: 0, due: 1, sent: 0, retried: 0, failed: 1 });
    } finally {
        globalThis.fetch = matrix.fetch;
    }
    const row = db.getDeadmanReleaseNotice(record.id, leaving.user.id)!;
    assert.equal(row.status, 'failed');
    assert.equal(row.lastError, 'recipient_gone');
    assert.equal(row.sentAt, undefined);
    assert.equal(row.roomId, undefined, 'the room stays forgotten');
    assert.equal(
        matrix.sends.filter((s) => s.txnId.includes(record.id)).length,
        1,
        'the send did go'
    );

    // An account that vanished another way during the send, its rows untouched:
    // the account is read again before the row is marked, and the notice ends.
    const vanishing = await freshPerson();
    const second = await released(await freshPerson(), [vanishing.keySet.identity]);
    let release2!: () => void;
    const gate2 = new Promise<void>((resolve) => {
        release2 = resolve;
    });
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
            typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/send/')) await gate2;
        return stubFetch(input, init);
    }) as typeof fetch;
    try {
        const tick = runDeadmanReleaseNotifier({ now: second.at });
        await new Promise((resolve) => setTimeout(resolve, 20));
        db.deleteUser(vanishing.user.id);
        assert.equal(
            db.getDeadmanReleaseNotice(second.record.id, vanishing.user.id)?.status,
            'pending'
        );
        release2();
        assert.deepEqual(await within(5000, tick), {
            caughtUp: 0,
            due: 1,
            sent: 0,
            retried: 0,
            failed: 1,
        });
    } finally {
        globalThis.fetch = matrix.fetch;
    }
    const gone = db.getDeadmanReleaseNotice(second.record.id, vanishing.user.id)!;
    assert.equal(gone.status, 'failed');
    assert.equal(gone.lastError, 'recipient_gone');
    assert.equal(gone.roomId, undefined);

    // The row's own word stands even while the account exists: a row ended
    // during the send, by whatever ended it, is not marked sent over.
    const standing = await freshPerson();
    const third = await released(await freshPerson(), [standing.keySet.identity]);
    let release3!: () => void;
    const gate3 = new Promise<void>((resolve) => {
        release3 = resolve;
    });
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
            typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/send/')) await gate3;
        return stubFetch(input, init);
    }) as typeof fetch;
    try {
        const tick = runDeadmanReleaseNotifier({ now: third.at });
        await new Promise((resolve) => setTimeout(resolve, 20));
        db.updateDeadmanReleaseNotice(third.record.id, standing.user.id, {
            status: 'failed',
            failedAt: third.at.toISOString(),
            lastError: 'ended_meanwhile',
        });
        release3();
        assert.deepEqual(await within(5000, tick), {
            caughtUp: 0,
            due: 1,
            sent: 0,
            retried: 0,
            failed: 1,
        });
    } finally {
        globalThis.fetch = matrix.fetch;
    }
    const ended = db.getDeadmanReleaseNotice(third.record.id, standing.user.id)!;
    assert.equal(ended.status, 'failed');
    assert.equal(ended.lastError, 'ended_meanwhile', 'not overwritten');
    assert.equal(ended.sentAt, undefined);
    assert.ok(db.getUserById(standing.user.id), 'the account is still there');

    // A deletion during a send the homeserver then refuses: the retry is not
    // written over the ended row either (round 2 of part 2's review: the row
    // read `matrix_send_status_500`, attempts 1 and a new backoff where the
    // deletion had written `recipient_gone`).
    const refused = await freshPerson();
    const fourth = await released(await freshPerson(), [refused.keySet.identity]);
    const rowBefore = db.getDeadmanReleaseNotice(fourth.record.id, refused.user.id)!;
    let release4!: () => void;
    const gate4 = new Promise<void>((resolve) => {
        release4 = resolve;
    });
    matrix.sendStatus = 500;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
            typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/send/')) await gate4;
        return stubFetch(input, init);
    }) as typeof fetch;
    try {
        const tick = runDeadmanReleaseNotifier({ now: fourth.at });
        await new Promise((resolve) => setTimeout(resolve, 20));
        const issued = lifecycle.requestAccountDeletion({ userId: refused.user.id })!;
        assert.equal(lifecycle.confirmAccountDeletion(issued.token, refused.user.id).kind, 'ok');
        release4();
        assert.deepEqual(await within(5000, tick), {
            caughtUp: 0,
            due: 1,
            sent: 0,
            retried: 0,
            failed: 1,
        });
    } finally {
        matrix.sendStatus = 200;
        globalThis.fetch = matrix.fetch;
    }
    const kept = db.getDeadmanReleaseNotice(fourth.record.id, refused.user.id)!;
    assert.equal(kept.status, 'failed');
    assert.equal(kept.lastError, 'recipient_gone', 'the refusal is not written over the deletion');
    assert.equal(kept.attempts, 0, 'no attempt counted on the ended row');
    assert.equal(kept.nextAttemptAt, rowBefore.nextAttemptAt, 'no backoff written');
    assert.equal(kept.roomId, undefined);
});

test('a deletion that lands while the room is being found or made is seen before anything is recorded: no room on the row, no re-invite, no send', async () => {
    // The row is read again after each homeserver call in find-or-make (round
    // 2 of part 2's review: a deletion during createRoom put the new room on
    // the row the deletion had ended, and the notice was sent into it).
    const stubFetch = matrix.fetch;
    const parkWhile = (match: (url: string, init?: RequestInit) => boolean) => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const url =
                typeof input === 'string'
                    ? input
                    : input instanceof URL
                    ? input.toString()
                    : input.url;
            if (match(url, init)) await gate;
            return stubFetch(input, init);
        }) as typeof fetch;
        return release;
    };
    const deleteDuring = async (
        tick: Promise<unknown>,
        person: { user: User },
        release: () => void
    ) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        const issued = lifecycle.requestAccountDeletion({ userId: person.user.id })!;
        assert.equal(lifecycle.confirmAccountDeletion(issued.token, person.user.id).kind, 'ok');
        release();
        return within(5000, tick);
    };
    const ended = { caughtUp: 0, due: 1, sent: 0, retried: 0, failed: 1 };

    // During createRoom: the room is made (the homeserver was asked) but is
    // not recorded on the row, and nothing is sent into it.
    const first = await freshPerson();
    const one = await released(await freshPerson(), [first.keySet.identity]);
    matrix.clearCalls();
    try {
        const tick = runDeadmanReleaseNotifier({ now: one.at });
        const release = parkWhile((url) => url.includes('/createRoom'));
        assert.deepEqual(await deleteDuring(tick, first, release), ended);
    } finally {
        globalThis.fetch = matrix.fetch;
    }
    const createdFor = db.getDeadmanReleaseNotice(one.record.id, first.user.id)!;
    assert.equal(createdFor.status, 'failed');
    assert.equal(createdFor.lastError, 'recipient_gone');
    assert.equal(createdFor.roomId, undefined, 'the room made during the deletion is not recorded');
    assert.equal(createdFor.attempts, 0);
    assert.equal(matrix.creates.length, 1, 'the homeserver was asked before the deletion landed');
    assert.equal(matrix.sendsTo(matrix.creates[0].roomId).length, 0, 'nothing sent into it');

    // During the state read of an existing room: a second release to someone
    // whose room exists, deleted while the room's state is being read.
    const second = await freshPerson();
    const owner = await freshPerson();
    const earlier = await released(owner, [second.keySet.identity]);
    assert.equal((await runDeadmanReleaseNotifier({ now: earlier.at })).sent, 1);
    const roomId = db.getDeadmanReleaseNotice(earlier.record.id, second.user.id)!.roomId!;
    const later = await released(await freshPerson(), [second.keySet.identity]);
    matrix.clearCalls();
    try {
        const tick = runDeadmanReleaseNotifier({ now: later.at });
        const release = parkWhile((url) => url.includes('/_synapse/admin/v1/rooms/'));
        assert.deepEqual(await deleteDuring(tick, second, release), ended);
    } finally {
        globalThis.fetch = matrix.fetch;
    }
    const readFor = db.getDeadmanReleaseNotice(later.record.id, second.user.id)!;
    assert.equal(readFor.status, 'failed');
    assert.equal(readFor.lastError, 'recipient_gone');
    assert.equal(readFor.roomId, undefined);
    assert.equal(matrix.stateReads.length, 1, 'the state was read');
    assert.equal(matrix.sendsTo(roomId).length, 0, 'nothing sent into the existing room');
    assert.equal(matrix.creates.length, 0);

    // During the re-invite of someone who left: the invite goes to the
    // homeserver, is not recorded on the row, and nothing is sent.
    const third = await freshPerson();
    const thirdOwner = await freshPerson();
    const before = await released(thirdOwner, [third.keySet.identity]);
    assert.equal((await runDeadmanReleaseNotifier({ now: before.at })).sent, 1);
    const thirdRoom = db.getDeadmanReleaseNotice(before.record.id, third.user.id)!.roomId!;
    setMembership(thirdRoom, matrixUserIdFor(third.user.id)!, 'leave');
    const after = await released(await freshPerson(), [third.keySet.identity]);
    matrix.clearCalls();
    try {
        const tick = runDeadmanReleaseNotifier({ now: after.at });
        const release = parkWhile((url) => url.includes('/state/m.room.member/'));
        assert.deepEqual(await deleteDuring(tick, third, release), ended);
    } finally {
        globalThis.fetch = matrix.fetch;
    }
    const invitedFor = db.getDeadmanReleaseNotice(after.record.id, third.user.id)!;
    assert.equal(invitedFor.status, 'failed');
    assert.equal(invitedFor.lastError, 'recipient_gone');
    assert.equal(invitedFor.reinvitedAt, undefined, 'the re-invite is not recorded');
    assert.equal(invitedFor.roomId, undefined);
    assert.equal(matrix.invites.length, 1, 'the invite went to the homeserver');
    assert.equal(matrix.sendsTo(thirdRoom).length, 0);

    // While a notice waits for the person's slot: the slot's holder has its
    // createRoom parked, the deletion lands, and the waiting notice reads the
    // ended row once it holds the slot, so it makes no homeserver call of its
    // own (without that read it would make a second room for the deleted
    // account before its own re-read ended it).
    const fourth = await freshPerson();
    const pairA = await released(await freshPerson(), [fourth.keySet.identity]);
    const pairB = await released(await freshPerson(), [fourth.keySet.identity]);
    const now = new Date(Math.max(pairA.at.getTime(), pairB.at.getTime()));
    matrix.clearCalls();
    let results: unknown;
    try {
        const release = parkWhile((url) => url.includes('/createRoom'));
        const tickA = runDeadmanReleaseNotifier({ now });
        await new Promise((resolve) => setTimeout(resolve, 20));
        const tickB = runDeadmanReleaseNotifier({ now });
        await new Promise((resolve) => setTimeout(resolve, 20));
        const issued = lifecycle.requestAccountDeletion({ userId: fourth.user.id })!;
        assert.equal(lifecycle.confirmAccountDeletion(issued.token, fourth.user.id).kind, 'ok');
        release();
        results = await within(5000, Promise.all([tickA, tickB]));
    } finally {
        globalThis.fetch = matrix.fetch;
    }
    assert.notEqual(results, 'pending', 'both ticks finished');
    const [resultA, resultB] = results as Array<{ failed: number; sent: number }>;
    assert.equal(resultA.failed + resultB.failed, 2, 'both notices ended');
    assert.equal(resultA.sent + resultB.sent, 0);
    for (const record of [pairA.record, pairB.record]) {
        const row = db.getDeadmanReleaseNotice(record.id, fourth.user.id)!;
        assert.equal(row.status, 'failed');
        assert.equal(row.lastError, 'recipient_gone');
        assert.equal(row.roomId, undefined);
    }
    assert.equal(matrix.creates.length, 1, 'the waiting notice asked for no room of its own');
    assert.equal(matrix.sends.length, 0);
});

test('a homeserver call that never answers ends at the call timeout as that notice’s retry, and the next notice is not held behind it', async () => {
    // The ticks do not overlap, so a hung call would hold every due notice
    // for undici's five minutes (round 2 of part 2's review); each call has
    // NOTICE_CALL_TIMEOUT_MS, here shortened, and its request is aborted.
    const slow = await freshPerson();
    const quick = await freshPerson();
    const first = await released(await freshPerson(), [slow.keySet.identity]);
    const second = await released(await freshPerson(), [quick.keySet.identity]);
    matrix.clearCalls();
    const slowMxid = matrixUserIdFor(slow.user.id)!;
    const stubFetch = matrix.fetch;
    let release!: () => void;
    const never = new Promise<void>((resolve) => {
        release = resolve;
    });
    let abortedSignal: AbortSignal | undefined;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
            typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/createRoom') && String(init?.body).includes(slowMxid)) {
            abortedSignal = init?.signal ?? undefined;
            await never;
        }
        return stubFetch(input, init);
    }) as typeof fetch;
    const now = new Date(Math.max(first.at.getTime(), second.at.getTime()));
    try {
        const started = performance.now();
        const result = await within(5000, runDeadmanReleaseNotifier({ now, callTimeoutMs: 100 }));
        const elapsedMs = performance.now() - started;
        assert.deepEqual(result, { caughtUp: 0, due: 2, sent: 1, retried: 1, failed: 0 });
        assert.ok(elapsedMs < 3000, `the tick took ${elapsedMs} ms`);
    } finally {
        release();
        globalThis.fetch = matrix.fetch;
    }
    const held = db.getDeadmanReleaseNotice(first.record.id, slow.user.id)!;
    assert.equal(held.status, 'pending');
    assert.equal(held.attempts, 1);
    assert.equal(held.lastError, 'matrix_create_timeout');
    assert.equal(held.roomId, undefined, 'no room recorded for a call that never answered');
    assert.equal(
        held.nextAttemptAt,
        new Date(now.getTime() + NOTICE_BACKOFF_FIRST_MS).toISOString(),
        'the retry is backed off as any failure is'
    );
    assert.ok(abortedSignal?.aborted, 'the request was aborted through its signal');
    const sent = db.getDeadmanReleaseNotice(second.record.id, quick.user.id)!;
    assert.equal(sent.status, 'sent', 'the next notice was not held behind the hung call');
    assert.equal(matrix.sends.length, 1);
});

test('without a homeserver configured every attempt is a retry, and says so', async () => {
    const heidi = await freshPerson();
    const { record, at } = await released(await freshPerson(), [heidi.keySet.identity]);
    const homeserver = process.env.MATRIX_HOMESERVER;
    delete process.env.MATRIX_HOMESERVER;
    try {
        const result = await runDeadmanReleaseNotifier({ now: at });
        assert.equal(result.retried, 1);
        assert.equal(
            db.getDeadmanReleaseNotice(record.id, heidi.user.id)?.lastError,
            'matrix_create_matrix_not_configured'
        );
    } finally {
        process.env.MATRIX_HOMESERVER = homeserver;
    }
});

test('an overlapping tick does not send a notice twice or make a second room', async () => {
    const ivan = await freshPerson();
    const { record, at } = await released(await freshPerson(), [ivan.keySet.identity]);
    matrix.clearCalls();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const stubFetch = matrix.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
            typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/createRoom')) await gate;
        return stubFetch(input, init);
    }) as typeof fetch;
    try {
        const first = runDeadmanReleaseNotifier({ now: at });
        // Let the first tick reach the homeserver before the second starts.
        await new Promise((resolve) => setTimeout(resolve, 20));
        // A bounded wait: without the in-flight guard the second tick would
        // wait on the first's room slot, and this would fail, not hang.
        const second = await within(1500, runDeadmanReleaseNotifier({ now: at }));
        assert.deepEqual(
            second,
            { caughtUp: 0, due: 1, sent: 0, retried: 0, failed: 0 },
            'the second tick left it alone, and finished'
        );
        release();
        assert.equal((await first).sent, 1);
    } finally {
        globalThis.fetch = matrix.fetch;
    }
    assert.equal(matrix.creates.length, 1);
    assert.equal(matrix.sends.filter((s) => s.txnId.includes(record.id)).length, 1);
    assert.equal(db.getDeadmanReleaseNotice(record.id, ivan.user.id)?.attempts, 1);
});

test('two notices for one person in overlapping ticks make one room: the second waits for the first’s room and reuses it', async () => {
    const jo = await freshPerson();
    const joMxid = matrixUserIdFor(jo.user.id)!;
    const one = await released(await freshPerson(), [jo.keySet.identity]);
    const two = await released(await freshPerson(), [jo.keySet.identity], one.at);
    assert.equal(
        db
            .listDueDeadmanReleaseNotices(one.at.toISOString())
            .filter((n) => n.recipientAccountId === jo.user.id).length,
        2
    );
    matrix.clearCalls();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const stubFetch = matrix.fetch;
    let creates = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
            typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/createRoom')) {
            creates += 1;
            await gate;
        }
        return stubFetch(input, init);
    }) as typeof fetch;
    try {
        const first = runDeadmanReleaseNotifier({ now: one.at });
        await new Promise((resolve) => setTimeout(resolve, 20));
        // Tick 1 is inside createRoom for the first notice. Tick 2 takes the
        // second notice (not in flight) and must wait for Jo's room, not make one.
        const second = runDeadmanReleaseNotifier({ now: one.at });
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.equal(creates, 1, 'one createRoom in flight, not two');
        release();
        const results = await within(5000, Promise.all([first, second]));
        assert.notEqual(results, 'pending', 'both ticks finished');
        const [r1, r2] = results as [Awaited<typeof first>, Awaited<typeof second>];
        assert.equal(r1.sent + r2.sent, 2);
    } finally {
        globalThis.fetch = matrix.fetch;
    }
    const rooms = matrix.creates.filter((c) => (c.body.invite as string[]).includes(joMxid));
    assert.equal(rooms.length, 1, 'one room for Jo');
    const n1 = db.getDeadmanReleaseNotice(one.record.id, jo.user.id)!;
    const n2 = db.getDeadmanReleaseNotice(two.record.id, jo.user.id)!;
    assert.equal(n1.status, 'sent');
    assert.equal(n2.status, 'sent');
    assert.equal(n1.roomId, rooms[0].roomId);
    assert.equal(n2.roomId, rooms[0].roomId);
    assert.equal(matrix.sendsTo(rooms[0].roomId).length, 2);
});

test('the interval does not start a tick while the previous one runs', async () => {
    // Two people, two due notices, a createRoom that takes longer than the
    // interval: without the running guard the second interval tick would start
    // and park a second createRoom beside the first.
    const kim = await freshPerson();
    const lee = await freshPerson();
    const { at } = await released(await freshPerson(), [kim.keySet.identity, lee.keySet.identity]);
    for (const person of [kim, lee]) {
        const notice = db
            .listDeadmanReleaseNoticesForRecipient(person.user.id)
            .find((n) => n.status === 'pending')!;
        db.updateDeadmanReleaseNotice(notice.switchId, notice.recipientAccountId, {
            nextAttemptAt: new Date(0).toISOString(),
        });
    }
    void at;
    matrix.clearCalls();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const stubFetch = matrix.fetch;
    let parked = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
            typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/createRoom')) {
            parked += 1;
            await gate;
        }
        return stubFetch(input, init);
    }) as typeof fetch;
    const loop = startDeadmanReleaseNotifier(15);
    try {
        await new Promise((resolve) => setTimeout(resolve, 150));
        assert.equal(parked, 1, 'one tick in flight after ten intervals');
        release();
        for (let i = 0; i < 50 && matrix.sends.length < 2; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    } finally {
        loop.stop();
        stopDeadmanReleaseNotifier();
        await new Promise((resolve) => setTimeout(resolve, 50));
        globalThis.fetch = matrix.fetch;
    }
    assert.equal(matrix.sends.length, 2, 'both were sent by later ticks');
    assert.equal(matrix.creates.length, 2, 'one room each');
});

test('the notifier starts and stops like the other loops', () => {
    assert.equal(isDeadmanReleaseNotifierRunning(), false);
    const loop = startDeadmanReleaseNotifier(60_000);
    assert.equal(isDeadmanReleaseNotifierRunning(), true);
    const again = startDeadmanReleaseNotifier(60_000);
    assert.equal(isDeadmanReleaseNotifierRunning(), true);
    again.stop();
    assert.equal(isDeadmanReleaseNotifierRunning(), false);
    loop.stop();
    stopDeadmanReleaseNotifier();
    assert.equal(isDeadmanReleaseNotifierRunning(), false);
});

test('a tick sends at most 50 notices; the rest wait for the next', async () => {
    const owner = await freshPerson();
    const people: Array<{ user: User; keySet: ReleaseKeySet }> = [];
    for (let i = 0; i < 51; i += 1) people.push(await freshPerson());
    const { record, at } = await released(
        owner,
        people.map((p) => p.keySet.identity)
    );
    matrix.clearCalls();
    const first = await runDeadmanReleaseNotifier({ now: at });
    assert.deepEqual(first, { caughtUp: 0, due: 50, sent: 50, retried: 0, failed: 0 });
    assert.equal(
        db.listDeadmanReleaseNotices(record.id).filter((n) => n.status === 'pending').length,
        1
    );
    const second = await runDeadmanReleaseNotifier({ now: at });
    assert.deepEqual(second, { caughtUp: 0, due: 1, sent: 1, retried: 0, failed: 0 });
    assert.equal(matrix.creates.length, 51);
});

test('the catch-up lists each fired release’s copies by switch: a tick over many fired releases does not scan the copies', async () => {
    // The notifier's catch-up visits every fired release switch whose content
    // is held, every tick, for up to 365 days; each visit must be an indexed
    // lookup of that switch's copies (P3b-M4), not a scan of every copy row.
    const owner = randomUUID();
    const firedAt = new Date(Date.now() - 86_400_000).toISOString();
    for (let i = 0; i < 1000; i += 1) {
        const id = randomUUID();
        db.createDeadmanSwitch({
            id,
            ownerId: owner,
            status: 'triggered',
            checkInIntervalSeconds: 3600,
            gracePeriodSeconds: 0,
            lastCheckInAt: firedAt,
            triggerAt: firedAt,
            releaseAt: firedAt,
            recipients: [],
            encryptedPayload: '{"header":{},"ownerIdentity":{}}',
            releaseFormat: 'release-v1',
            releasedAt: firedAt,
        });
        for (const account of [owner, randomUUID(), randomUUID()]) {
            db.putDeadmanReleaseWrap({
                switchId: id,
                recipientAccountId: account,
                recipientFingerprint: 'ab'.repeat(32),
                sealedKey: 'sealed',
                signature: 'signed',
            });
            if (account !== owner) {
                db.createDeadmanReleaseNotice({
                    switchId: id,
                    recipientAccountId: account,
                    nextAttemptAt: firedAt,
                });
                db.updateDeadmanReleaseNotice(id, account, { status: 'sent', sentAt: firedAt });
            }
        }
    }
    const wraps = db.deadmanReleaseWraps as unknown as Record<string | symbol, unknown>;
    const iterators = ['values', 'entries', 'keys', 'forEach', Symbol.iterator] as const;
    const saved = iterators.map((name) => [name, wraps[name]] as const);
    let walks = 0;
    for (const [name, original] of saved) {
        wraps[name] = function walk(this: unknown, ...args: unknown[]) {
            walks += 1;
            return (original as (...a: unknown[]) => unknown).apply(this, args);
        };
    }
    const boom = async () => {
        throw new Error('the homeserver was touched');
    };
    let result: Awaited<ReturnType<typeof runDeadmanReleaseNotifier>>;
    try {
        result = await runDeadmanReleaseNotifier({
            now: new Date(),
            matrix: {
                createRoom: boom,
                getRoomStateAdmin: boom,
                inviteToRoom: boom,
                sendEvent: boom,
            } as never,
        });
    } finally {
        for (const [name] of saved) delete wraps[name];
    }
    assert.deepEqual(result, { caughtUp: 0, due: 0, sent: 0, retried: 0, failed: 0 });
    assert.equal(walks, 0, 'the copies map was not iterated');
});

test('a stop mid-tick ends the tick after the notice in hand; the rest stay pending for the next leader', async () => {
    const owner = await freshPerson();
    const judy = await freshPerson();
    const kim = await freshPerson();
    const { record, at } = await released(owner, [judy.keySet.identity, kim.keySet.identity]);
    matrix.clearCalls();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const stubFetch = matrix.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
            typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/createRoom')) await gate;
        return stubFetch(input, init);
    }) as typeof fetch;
    try {
        const tick = runDeadmanReleaseNotifier({ now: at });
        await new Promise((resolve) => setTimeout(resolve, 20));
        stopDeadmanReleaseNotifier();
        release();
        const result = await tick;
        assert.deepEqual(result, { caughtUp: 0, due: 2, sent: 1, retried: 0, failed: 0 });
    } finally {
        globalThis.fetch = matrix.fetch;
    }
    const statuses = db
        .listDeadmanReleaseNotices(record.id)
        .map((n) => n.status)
        .sort();
    assert.deepEqual(statuses, ['pending', 'sent']);
    assert.equal(matrix.creates.length, 1);
    // The next tick finishes the job.
    assert.equal((await runDeadmanReleaseNotifier({ now: at })).sent, 1);
});
