/**
 * The release notices (`docs/security/deadman-release-design-2026-10-24.md`
 * §5; `release-envelope-2026-10-26.md` §11): the sweep writes one row per
 * recipient with the trigger; the notifier makes the recipient's standing
 * "Blackout notices" room (unencrypted, a direct message, the person unable
 * to post), reuses it, invites the person again if they left, and sends one
 * m.text with the fixed body and the pointer, and nothing else; failures are
 * retried with backoff for 30 days and then recorded; a missing recipient or
 * release ends the notice; a fired switch without rows is caught up; an
 * overlapping tick sends nothing twice. The homeserver is the test stub:
 * what Synapse does with each call is read in the fork, not run here.
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

test('the notifier makes an unencrypted direct room the person cannot post in, and sends one m.text with the fixed body and the pointer, nothing else', async () => {
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
    assert.deepEqual(bobsRoom.body, {
        visibility: 'private',
        preset: 'private_chat',
        name: 'Blackout notices',
        power_level_content_override: { events_default: 50, invite: 50 },
        invite: [bobMxid],
        is_direct: true,
    });
    assert.equal(
        bobsRoom.body.initial_state,
        undefined,
        'no encryption event: the bot cannot encrypt'
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

    // A row whose switch is not a fired release (a store from a crash mid-way, say).
    const grace = await freshPerson();
    const armed = await armFor(await freshPerson(), [grace.keySet.identity]);
    db.createDeadmanReleaseNotice({
        switchId: armed.id,
        recipientAccountId: grace.user.id,
        nextAttemptAt: at.toISOString(),
    });
    const second = await runDeadmanReleaseNotifier({ now: at });
    assert.equal(second.failed, 1);
    assert.equal(
        db.getDeadmanReleaseNotice(armed.id, grace.user.id)?.lastError,
        'release_unavailable'
    );
    assert.equal(matrix.sends.length, 0);
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
        const second = await runDeadmanReleaseNotifier({ now: at });
        assert.deepEqual(
            second,
            { caughtUp: 0, due: 1, sent: 0, retried: 0, failed: 0 },
            'the second tick left it alone'
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
