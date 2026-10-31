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
 * the call timeout as that notice's retry, its request aborted; a room the
 * homeserver finished after the call timed out is found by its alias on the
 * retry, not made again, and a room is made without the alias when the alias
 * is refused or names a room that is gone, not the bot's, or still without
 * events at the notice's next attempt (a create the homeserver abandoned);
 * a notice another process ended meanwhile is counted as it ended. The homeserver
 * is the test stub: what Synapse does with each call is read in the fork,
 * not run here (the preset's effect on encryption was run against the fork's
 * own code by the independent review, P3b-M1; the stub refuses a taken alias
 * before making a room, as `handlers/room.py` does).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';
import { createMatrixStub, createdRoomState, memberEvent } from './_fixtures/matrixStub';
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
    noticeRoomAlias,
    noticeRoomAliasLocalpart,
    runDeadmanReleaseNotifier,
    startDeadmanReleaseNotifier,
    stopDeadmanReleaseNotifier,
} = await import('../src/services/deadmanReleaseNotifier');
const { computeDeadlines } = await import('../src/services/deadmanScheduler');
const { matrixUserIdFor } = await import('../src/services/userIdentity');
const { matrixClient } = await import('../src/integrations/matrix-client');
const lifecycle = await import('../src/services/accountLifecycle');

/** Resolve to `pending` if `work` has not settled within `ms`: a bounded wait that fails instead of hanging. */
const within = <T>(ms: number, work: Promise<T>): Promise<T | 'pending'> =>
    Promise.race([
        work,
        new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), ms)),
    ]);

/** When a notice row is next due, or the latest of several rows. */
const dueAt = (...rows: Array<{ switchId: string; accountId: string }>): Date =>
    new Date(
        Math.max(
            ...rows.map(({ switchId, accountId }) =>
                Date.parse(db.getDeadmanReleaseNotice(switchId, accountId)!.nextAttemptAt)
            )
        )
    );

/** One tick at `now`, and how long it ran in real time. */
const timedTick = async (
    now: Date,
    options: Omit<Parameters<typeof runDeadmanReleaseNotifier>[0] & object, 'now'> = {}
) => {
    const started = Date.now();
    const result = await runDeadmanReleaseNotifier({ now, ...options });
    return { result, tookMs: Date.now() - started };
};

/**
 * A retry is due one backoff after it was recorded, on the tick's clock (its
 * `now` moved on by the time the tick has run): no earlier than `now` plus
 * the backoff, and no later than that plus the tick's run time (round 5 of
 * part 2's review: it was timed from the tick's start).
 */
const assertDueOneBackoffLater = (
    nextAttemptAt: string,
    now: Date,
    backoffMs: number,
    tookMs: number
) => {
    const offset = Date.parse(nextAttemptAt) - now.getTime();
    assert.ok(
        offset >= backoffMs && offset <= backoffMs + tookMs,
        `due ${offset} ms after the tick's now; expected ${backoffMs} to ${backoffMs + tookMs}`
    );
};

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

/**
 * Move every row still pending from earlier tests (the stop mid-tick test
 * leaves one for the next leader) past the next day, so that a tick's counts
 * in the test that calls this are its own rows'.
 */
const pushEarlierRowsOut = () => {
    const horizon = Date.now() + 24 * 60 * 60 * 1000;
    for (const row of db.listDueDeadmanReleaseNotices(new Date(horizon).toISOString())) {
        db.updateDeadmanReleaseNotice(row.switchId, row.recipientAccountId, {
            nextAttemptAt: new Date(horizon + NOTICE_RETRY_WINDOW_MS).toISOString(),
        });
    }
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

test('the notifier asks for a direct room with the body the homeserver’s backstop leaves unencrypted (public_chat, an invite-only join rule in initial_state) that the person cannot post in, with the person’s alias, and sends one m.text with the fixed body and the pointer, nothing else', async () => {
    matrix.clearCalls();
    const owner = await freshPerson();
    const carol = await freshPerson();
    const carolMxid = matrixUserIdFor(carol.user.id)!;
    const { record, at } = await released(owner, [bob.keySet.identity, carol.keySet.identity]);

    const result = await runDeadmanReleaseNotifier({ now: at });
    assert.deepEqual(result, { caughtUp: 0, due: 2, sent: 2, retried: 0, failed: 0, elsewhere: 0 });

    assert.equal(matrix.creates.length, 2, 'one room per recipient');
    const bobsRoom = matrix.creates.find((c) => (c.body.invite as string[]).includes(bobMxid))!;
    assert.ok(bobsRoom);
    // The exact body. `public_chat` is what keeps the homeserver's
    // `encryption_enabled_by_default_for_room_type: invite` from adding
    // m.room.encryption (it keys on the preset, not the join rule), and the
    // join rule in initial_state is what Synapse sends in place of the
    // preset's public one; `private` keeps it out of the public room list (the
    // alias is in the alias directory, keyed below). What the
    // homeserver then does with this body is read in the fork, and was run
    // against it by the review, not by this stub.
    assert.deepEqual(bobsRoom.body, {
        visibility: 'private',
        preset: 'public_chat',
        initial_state: [
            { type: 'm.room.join_rules', state_key: '', content: { join_rule: 'invite' } },
        ],
        room_alias_name: noticeRoomAliasLocalpart(bobMxid),
        name: 'Blackout notices',
        power_level_content_override: { events_default: 50, invite: 50 },
        invite: [bobMxid],
        is_direct: true,
    });
    assert.ok(
        !JSON.stringify(bobsRoom.body).includes('m.room.encryption'),
        'no encryption event of the bot’s own either: it cannot encrypt'
    );
    // The alias: the prefix and 128 bits of an HMAC over the Matrix id under
    // a key derived from the server's secret, so it is stable per person,
    // differs per person, and carries neither the id nor anything computable
    // without the secret.
    assert.match(String(bobsRoom.body.room_alias_name), /^blackout-notices-[0-9a-f]{32}$/);
    assert.equal(noticeRoomAliasLocalpart(bobMxid), noticeRoomAliasLocalpart(bobMxid));
    assert.notEqual(noticeRoomAliasLocalpart(bobMxid), noticeRoomAliasLocalpart(carolMxid));
    assert.ok(!String(bobsRoom.body.room_alias_name).includes(bob.user.username));
    // Keyed by the server's secret, computed here on its own: an unkeyed or
    // constant-key hash would let anyone on the homeserver, or over
    // federation, check through the alias directory whether a Matrix id has a
    // notices room, which says it was named on a fired release (round 4 of
    // part 2's review: no test pinned the key).
    const purposeKey = createHmac('sha256', process.env.JWT_SECRET_PRIMARY!.trim())
        .update('blackout-deadman-notice-room-alias')
        .digest();
    const keyed = createHmac('sha256', purposeKey).update(bobMxid).digest('hex').slice(0, 32);
    assert.equal(noticeRoomAliasLocalpart(bobMxid), `blackout-notices-${keyed}`);
    assert.notEqual(
        keyed,
        createHash('sha256').update(bobMxid).digest('hex').slice(0, 32),
        'not an unkeyed hash of the Matrix id'
    );
    assert.equal(noticeRoomAlias(bobMxid), `#${noticeRoomAliasLocalpart(bobMxid)}:test.local`);
    assert.equal(matrix.aliases.get(noticeRoomAlias(bobMxid)), bobsRoom.roomId);
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
        elsewhere: 0,
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

    // A room the homeserver no longer has is replaced (a purge frees its alias too).
    matrix.purgeRoom(roomId);
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
    const row = { switchId: record.id, accountId: dave.user.id };
    try {
        const { result: first, tookMs: firstTook } = await timedTick(at);
        assert.deepEqual(first, {
            caughtUp: 0,
            due: 1,
            sent: 0,
            retried: 1,
            failed: 0,
            elsewhere: 0,
        });
        let notice = db.getDeadmanReleaseNotice(record.id, dave.user.id)!;
        assert.equal(notice.status, 'pending');
        assert.equal(notice.attempts, 1);
        assert.equal(notice.lastError, 'matrix_create_create_rejected');
        assert.equal(notice.roomId, undefined, 'no room was made');
        assertDueOneBackoffLater(notice.nextAttemptAt, at, 30_000, firstTook);
        assert.equal(matrix.sends.length, 0);

        // Not due until then.
        const early = await runDeadmanReleaseNotifier({ now: new Date(at.getTime() + 29_000) });
        assert.equal(early.due, 0);
        const secondAt = dueAt(row);
        const { result: second, tookMs: secondTook } = await timedTick(secondAt);
        assert.equal(second.retried, 1);
        notice = db.getDeadmanReleaseNotice(record.id, dave.user.id)!;
        assert.equal(notice.attempts, 2);
        assertDueOneBackoffLater(notice.nextAttemptAt, secondAt, 60_000, secondTook);
    } finally {
        matrix.createStatus = 200;
    }

    // The room is made, but the send fails.
    matrix.sendStatus = 500;
    try {
        const thirdAt = dueAt(row);
        const { result: third, tookMs: thirdTook } = await timedTick(thirdAt);
        assert.equal(third.retried, 1);
        const notice = db.getDeadmanReleaseNotice(record.id, dave.user.id)!;
        assert.equal(notice.attempts, 3);
        assert.equal(notice.lastError, 'matrix_send_status_500');
        assert.ok(notice.roomId, 'the room is recorded before the send');
        assert.equal(notice.status, 'pending');
        assertDueOneBackoffLater(notice.nextAttemptAt, thirdAt, 120_000, thirdTook);
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
        const fourth = await runDeadmanReleaseNotifier({ now: dueAt(row) });
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
    const fifth = await runDeadmanReleaseNotifier({ now: dueAt(row) });
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
        const { result: stillOpen, tookMs } = await timedTick(lastTry);
        assert.equal(stillOpen.retried, 1, 'retried until the window closes');
        // Due again after its backoff, which is now past the window.
        const nextDue = db.getDeadmanReleaseNotice(record.id, erin.user.id)!.nextAttemptAt;
        assertDueOneBackoffLater(nextDue, lastTry, noticeBackoffMs(2), tookMs);
        const closed = await runDeadmanReleaseNotifier({ now: new Date(Date.parse(nextDue)) });
        assert.deepEqual(closed, {
            caughtUp: 0,
            due: 1,
            sent: 0,
            retried: 0,
            failed: 1,
            elsewhere: 0,
        });
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
    assert.deepEqual(result, { caughtUp: 1, due: 1, sent: 1, retried: 0, failed: 0, elsewhere: 0 });
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
    assert.deepEqual(result, { caughtUp: 0, due: 1, sent: 0, retried: 0, failed: 1, elsewhere: 0 });
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
    assert.deepEqual(second, { caughtUp: 0, due: 2, sent: 0, retried: 0, failed: 2, elsewhere: 0 });
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
    assert.deepEqual(before, { caughtUp: 0, due: 0, sent: 0, retried: 0, failed: 0, elsewhere: 0 });
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
    assert.deepEqual(after, { caughtUp: 0, due: 1, sent: 1, retried: 0, failed: 0, elsewhere: 0 });
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
    let throwingTook = 0;
    try {
        const { result: tick, tookMs } = await timedTick(at);
        throwingTook = tookMs;
        assert.deepEqual(tick, {
            caughtUp: 0,
            due: 2,
            sent: 1,
            retried: 1,
            failed: 0,
            elsewhere: 0,
        });
    } finally {
        globalThis.fetch = matrix.fetch;
    }
    const daves = db.getDeadmanReleaseNotice(second.record.id, dave.user.id)!;
    assert.equal(daves.status, 'pending');
    assert.equal(daves.attempts, 1);
    assert.equal(daves.lastError, 'matrix_invite_network_error');
    assertDueOneBackoffLater(daves.nextAttemptAt, at, 30_000, throwingTook);
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
    const later = dueAt(
        { switchId: second.record.id, accountId: dave.user.id },
        { switchId: fays.record.id, accountId: fay.user.id }
    );
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
    matrix.purgeRoom(roomX);
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
        assert.deepEqual(result, {
            caughtUp: 0,
            due: 1,
            sent: 0,
            retried: 0,
            failed: 1,
            elsewhere: 0,
        });
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
            elsewhere: 0,
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
            elsewhere: 0,
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
            elsewhere: 0,
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
    const ended = { caughtUp: 0, due: 1, sent: 0, retried: 0, failed: 1, elsewhere: 0 };

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
    let elapsedMs = 0;
    try {
        const started = performance.now();
        const result = await within(5000, runDeadmanReleaseNotifier({ now, callTimeoutMs: 100 }));
        elapsedMs = performance.now() - started;
        assert.deepEqual(result, {
            caughtUp: 0,
            due: 2,
            sent: 1,
            retried: 1,
            failed: 0,
            elsewhere: 0,
        });
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
    // The retry is backed off as any failure is, from when it was recorded.
    assertDueOneBackoffLater(held.nextAttemptAt, now, NOTICE_BACKOFF_FIRST_MS, elapsedMs + 1);
    assert.ok(abortedSignal?.aborted, 'the request was aborted through its signal');
    const sent = db.getDeadmanReleaseNotice(second.record.id, quick.user.id)!;
    assert.equal(sent.status, 'sent', 'the next notice was not held behind the hung call');
    assert.equal(matrix.sends.length, 1);
    // Left pending, but not for the later tests' ticks.
    db.updateDeadmanReleaseNotice(first.record.id, slow.user.id, {
        nextAttemptAt: new Date(Date.now() + NOTICE_RETRY_WINDOW_MS).toISOString(),
    });

    // The other calls the same way: the state read of a known room, the
    // re-invite of someone who left, the send, and the alias lookup after a
    // taken alias (round 3 of part 2's review: only createRoom's abort was
    // pinned, and a state read or send without its signal kept its socket).
    const parkAndAbort = async (
        person: { user: User },
        releaseOf: Awaited<ReturnType<typeof released>>,
        match: (url: string, init?: RequestInit) => boolean,
        expectedReason: string
    ) => {
        let signal: AbortSignal | undefined;
        let unpark!: () => void;
        const parked = new Promise<void>((resolve) => {
            unpark = resolve;
        });
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const url =
                typeof input === 'string'
                    ? input
                    : input instanceof URL
                    ? input.toString()
                    : input.url;
            if (match(url, init)) {
                signal = init?.signal ?? undefined;
                await parked;
            }
            return stubFetch(input, init);
        }) as typeof fetch;
        try {
            const result = await within(
                5000,
                runDeadmanReleaseNotifier({ now: releaseOf.at, callTimeoutMs: 100 })
            );
            assert.deepEqual(result, {
                caughtUp: 0,
                due: 1,
                sent: 0,
                retried: 1,
                failed: 0,
                elsewhere: 0,
            });
        } finally {
            unpark();
            globalThis.fetch = matrix.fetch;
        }
        const row = db.getDeadmanReleaseNotice(releaseOf.record.id, person.user.id)!;
        assert.equal(row.status, 'pending');
        assert.equal(row.lastError, expectedReason);
        assert.ok(signal?.aborted, `${expectedReason}: the request was aborted through its signal`);
        // Left pending for the next tick, not for this test's later cases.
        db.updateDeadmanReleaseNotice(row.switchId, row.recipientAccountId, {
            nextAttemptAt: new Date(Date.now() + NOTICE_RETRY_WINDOW_MS).toISOString(),
        });
    };
    // The state read: a person whose room exists.
    const known = await freshPerson();
    assert.equal(
        (
            await runDeadmanReleaseNotifier({
                now: (await released(await freshPerson(), [known.keySet.identity])).at,
            })
        ).sent,
        1
    );
    const knownRoom = db.findDeadmanNoticeRoom(known.user.id)!;
    await parkAndAbort(
        known,
        await released(await freshPerson(), [known.keySet.identity]),
        (url) => url.includes(`/_synapse/admin/v1/rooms/${encodeURIComponent(knownRoom)}/state`),
        'matrix_state_timeout'
    );
    // The re-invite: the person left their room.
    setMembership(knownRoom, matrixUserIdFor(known.user.id)!, 'leave');
    await parkAndAbort(
        known,
        await released(await freshPerson(), [known.keySet.identity]),
        (url) => url.includes('/state/m.room.member/'),
        'matrix_invite_timeout'
    );
    setMembership(knownRoom, matrixUserIdFor(known.user.id)!, 'join');
    // The send.
    await parkAndAbort(
        known,
        await released(await freshPerson(), [known.keySet.identity]),
        (url) => url.includes('/send/'),
        'matrix_send_timeout'
    );
    // The alias lookup: a person whose alias is taken by a room no row knows.
    const taken = await freshPerson();
    const takenMxid = matrixUserIdFor(taken.user.id)!;
    matrix.aliases.set(noticeRoomAlias(takenMxid), '!elsewhere:test.local');
    await parkAndAbort(
        taken,
        await released(await freshPerson(), [taken.keySet.identity]),
        (url) => url.includes('/directory/room/'),
        'matrix_alias_timeout'
    );
    // The bot's own id, asked once the alias names a room: the client caches
    // the answer for the process, so a stand-in whose whoami never answers.
    let whoamiSignal: AbortSignal | undefined;
    const whoamiNeverAnswers = {
        ...matrixClient,
        botUserId: (options: { signal?: AbortSignal } = {}) => {
            whoamiSignal = options.signal;
            return new Promise<string | undefined>(() => {});
        },
    };
    const asking = await released(await freshPerson(), [taken.keySet.identity]);
    const asked = await within(
        5000,
        runDeadmanReleaseNotifier({
            now: asking.at,
            matrix: whoamiNeverAnswers,
            callTimeoutMs: 100,
        })
    );
    assert.deepEqual(asked, { caughtUp: 0, due: 1, sent: 0, retried: 1, failed: 0, elsewhere: 0 });
    assert.equal(
        db.getDeadmanReleaseNotice(asking.record.id, taken.user.id)!.lastError,
        'matrix_whoami_timeout'
    );
    assert.ok(
        whoamiSignal?.aborted,
        'matrix_whoami_timeout: the request was aborted through its signal'
    );
    for (const row of db.listDeadmanReleaseNoticesForRecipient(taken.user.id)) {
        db.updateDeadmanReleaseNotice(row.switchId, row.recipientAccountId, {
            nextAttemptAt: new Date(Date.now() + NOTICE_RETRY_WINDOW_MS).toISOString(),
        });
    }
    matrix.aliases.delete(noticeRoomAlias(takenMxid));
});

test('a createRoom the homeserver finished after the call timed out is found by the room’s alias on the retry: one room per person, fresh from the directory', async () => {
    // As first fixed, a create that timed out on this side while the
    // homeserver made the room left the person one more empty "Blackout
    // notices" room with a standing invite per such attempt (round 3 of part
    // 2's review, the verifiers' scenario D). Now the room carries the
    // person's alias, the homeserver refuses a second room with it, and the
    // retry resolves the alias instead.
    const erin = await freshPerson();
    const erinMxid = matrixUserIdFor(erin.user.id)!;
    const one = await released(await freshPerson(), [erin.keySet.identity]);
    const two = await released(await freshPerson(), [erin.keySet.identity], one.at);
    matrix.clearCalls();
    const stubFetch = matrix.fetch;
    const roomsFor = () =>
        [...matrix.rooms.entries()]
            .filter(
                ([, state]) =>
                    Array.isArray(state) &&
                    state.some((e) => e.type === 'm.room.member' && e.state_key === erinMxid)
            )
            .map(([id]) => id);
    // The homeserver makes the room, then answers after the call timed out.
    const slowSuccessfulCreate = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
            typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const response = await stubFetch(input, init);
        if (url.includes('/createRoom') && response.ok) {
            await new Promise((resolve) => setTimeout(resolve, 150));
        }
        return response;
    }) as typeof fetch;
    globalThis.fetch = slowSuccessfulCreate;
    let first;
    try {
        first = await runDeadmanReleaseNotifier({ now: one.at, callTimeoutMs: 40 });
    } finally {
        globalThis.fetch = matrix.fetch;
    }
    // The first notice's create timed out; the second, in the same tick, was
    // refused the alias and found the room.
    assert.deepEqual(first, { caughtUp: 0, due: 2, sent: 1, retried: 1, failed: 0, elsewhere: 0 });
    assert.equal(matrix.creates.length, 1, 'the homeserver made one room');
    assert.deepEqual(
        matrix.createRefusals.map((r) => r.errcode),
        ['M_ROOM_IN_USE'],
        'the second create was refused the alias, and made no room'
    );
    const roomA = matrix.creates[0].roomId;
    assert.deepEqual(roomsFor(), [roomA]);
    assert.deepEqual(matrix.aliasReads, [noticeRoomAlias(erinMxid)]);
    const rows = [one, two].map((r) => db.getDeadmanReleaseNotice(r.record.id, erin.user.id)!);
    assert.deepEqual(rows.map((r) => r.status).sort(), ['pending', 'sent']);
    assert.equal(rows.find((r) => r.status === 'pending')!.lastError, 'matrix_create_timeout');
    assert.equal(rows.find((r) => r.status === 'sent')!.roomId, roomA);
    assert.equal(matrix.sendsTo(roomA).length, 1);

    // The retry: the row that timed out knows no room, but the person's other
    // row does, so it is reused; no create at all.
    matrix.clearCalls();
    const retryAt = dueAt(
        { switchId: one.record.id, accountId: erin.user.id },
        { switchId: two.record.id, accountId: erin.user.id }
    );
    assert.equal((await runDeadmanReleaseNotifier({ now: retryAt })).sent, 1);
    assert.equal(matrix.creates.length + matrix.createRefusals.length, 0);
    assert.deepEqual(roomsFor(), [roomA], 'still one room');
    assert.equal(matrix.sendsTo(roomA).length, 1);
    for (const r of [one, two]) {
        assert.equal(db.getDeadmanReleaseNotice(r.record.id, erin.user.id)!.roomId, roomA);
    }

    // One person, one notice, the create times out: the retry's create is
    // refused the alias, and the alias is resolved to the room.
    const fay = await freshPerson();
    const fayMxid = matrixUserIdFor(fay.user.id)!;
    const fays = await released(await freshPerson(), [fay.keySet.identity]);
    matrix.clearCalls();
    globalThis.fetch = slowSuccessfulCreate;
    try {
        assert.deepEqual(await runDeadmanReleaseNotifier({ now: fays.at, callTimeoutMs: 40 }), {
            caughtUp: 0,
            due: 1,
            sent: 0,
            retried: 1,
            failed: 0,
            elsewhere: 0,
        });
    } finally {
        globalThis.fetch = matrix.fetch;
    }
    const faysRoom = matrix.creates[0].roomId;
    assert.equal(db.getDeadmanReleaseNotice(fays.record.id, fay.user.id)!.roomId, undefined);
    matrix.clearCalls();
    const faysRetry = dueAt({ switchId: fays.record.id, accountId: fay.user.id });
    assert.equal((await runDeadmanReleaseNotifier({ now: faysRetry })).sent, 1);
    assert.equal(matrix.creates.length, 0, 'no second room');
    assert.deepEqual(
        matrix.createRefusals.map((r) => r.errcode),
        ['M_ROOM_IN_USE']
    );
    assert.deepEqual(matrix.aliasReads, [noticeRoomAlias(fayMxid)]);
    assert.deepEqual(matrix.stateReads, [faysRoom], 'the room found is checked for the person');
    const faysRow = db.getDeadmanReleaseNotice(fays.record.id, fay.user.id)!;
    assert.equal(faysRow.status, 'sent');
    assert.equal(faysRow.roomId, faysRoom);
    assert.equal(matrix.sendsTo(faysRoom).length, 1);

    // After a purge the alias is free and a later timed-out create takes it
    // again: the retry resolves the alias fresh from the directory, not from
    // the client's process cache, which would still name the purged room.
    matrix.purgeRoom(faysRoom);
    const again = await released(
        await freshPerson(),
        [fay.keySet.identity],
        new Date(faysRetry.getTime() + 1000)
    );
    matrix.clearCalls();
    globalThis.fetch = slowSuccessfulCreate;
    try {
        assert.equal(
            (await runDeadmanReleaseNotifier({ now: again.at, callTimeoutMs: 40 })).retried,
            1
        );
    } finally {
        globalThis.fetch = matrix.fetch;
    }
    assert.equal(matrix.stateReads[0], faysRoom, 'the purged room answered 404');
    const roomC = matrix.creates[0].roomId;
    assert.notEqual(roomC, faysRoom);
    matrix.clearCalls();
    const againRetry = dueAt({ switchId: again.record.id, accountId: fay.user.id });
    assert.equal((await runDeadmanReleaseNotifier({ now: againRetry })).sent, 1);
    assert.equal(matrix.creates.length, 0, 'no second room after the purge either');
    assert.deepEqual(
        matrix.createRefusals.map((r) => r.errcode),
        ['M_ROOM_IN_USE']
    );
    assert.deepEqual(matrix.aliasReads, [noticeRoomAlias(fayMxid)], 'the directory was asked');
    const movedRow = db.getDeadmanReleaseNotice(again.record.id, fay.user.id)!;
    assert.equal(movedRow.status, 'sent');
    assert.equal(movedRow.roomId, roomC);
    assert.equal(
        db.getDeadmanReleaseNotice(fays.record.id, fay.user.id)!.roomId,
        roomC,
        'the earlier row that pointed at the purged room moved to the replacement'
    );
    assert.equal(matrix.sendsTo(roomC).length, 1);
});

test('when the alias cannot be used the room is made without it: an alias the homeserver refuses, or one naming a room that is gone or that the bot did not make; a room the homeserver is still making is waited for, one backoff', async () => {
    const stubFetch = matrix.fetch;
    let createPosts = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
            typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/createRoom')) createPosts += 1;
        return stubFetch(input, init);
    }) as typeof fetch;
    const roomWithout = (personMxid: string) => {
        const plain = matrix.creates.filter(
            (c) =>
                (c.body.invite as string[]).includes(personMxid) &&
                c.body.room_alias_name === undefined
        );
        assert.equal(plain.length, 1, 'one room made without the alias');
        return plain[0].roomId;
    };
    try {
        // The homeserver refuses the alias itself: a policy that forbids the
        // bot (403), or an appservice's namespace (400 M_EXCLUSIVE).
        for (const refusal of [
            { status: 403, errcode: 'M_UNKNOWN' },
            { status: 400, errcode: 'M_EXCLUSIVE' },
        ]) {
            const person = await freshPerson();
            const personMxid = matrixUserIdFor(person.user.id)!;
            const release = await released(await freshPerson(), [person.keySet.identity]);
            matrix.clearCalls();
            createPosts = 0;
            matrix.aliasRefusal = refusal;
            try {
                assert.equal((await runDeadmanReleaseNotifier({ now: release.at })).sent, 1);
            } finally {
                matrix.aliasRefusal = null;
            }
            assert.deepEqual(
                matrix.createRefusals.map((r) => [r.errcode, typeof r.body.room_alias_name]),
                [[refusal.errcode, 'string']],
                'the create with the alias was refused'
            );
            assert.equal(createPosts, 2);
            const room = roomWithout(personMxid);
            assert.equal(
                db.getDeadmanReleaseNotice(release.record.id, person.user.id)!.roomId,
                room
            );
            assert.equal(matrix.sendsTo(room).length, 1);
            assert.equal(matrix.aliases.has(noticeRoomAlias(personMxid)), false);
        }

        // Any other refusal is the notice's retry, with no second create.
        const refused = await freshPerson();
        const refusedRelease = await released(await freshPerson(), [refused.keySet.identity]);
        matrix.clearCalls();
        createPosts = 0;
        matrix.createStatus = 500;
        try {
            assert.equal((await runDeadmanReleaseNotifier({ now: refusedRelease.at })).retried, 1);
        } finally {
            matrix.createStatus = 200;
        }
        assert.equal(createPosts, 1, 'a 500 is not taken for an alias refusal');
        assert.equal(
            db.getDeadmanReleaseNotice(refusedRelease.record.id, refused.user.id)!.lastError,
            'matrix_create_create_rejected'
        );
        db.updateDeadmanReleaseNotice(refusedRelease.record.id, refused.user.id, {
            nextAttemptAt: new Date(Date.now() + NOTICE_RETRY_WINDOW_MS).toISOString(),
        });

        // The alias names a room the homeserver answers 404 for (one that
        // lost its room and kept its alias).
        const gil = await freshPerson();
        const gilMxid = matrixUserIdFor(gil.user.id)!;
        matrix.aliases.set(noticeRoomAlias(gilMxid), '!purged-but-aliased:test.local');
        const gils = await released(await freshPerson(), [gil.keySet.identity]);
        matrix.clearCalls();
        assert.equal((await runDeadmanReleaseNotifier({ now: gils.at })).sent, 1);
        assert.deepEqual(
            matrix.createRefusals.map((r) => r.errcode),
            ['M_ROOM_IN_USE']
        );
        assert.deepEqual(matrix.aliasReads, [noticeRoomAlias(gilMxid)]);
        assert.deepEqual(matrix.stateReads, ['!purged-but-aliased:test.local']);
        const gilsRoom = roomWithout(gilMxid);
        assert.equal(db.getDeadmanReleaseNotice(gils.record.id, gil.user.id)!.roomId, gilsRoom);
        assert.equal(matrix.sendsTo(gilsRoom).length, 1);
        matrix.aliases.delete(noticeRoomAlias(gilMxid));

        // The alias names a room another account made: an admin who shut the
        // person's room down with a replacement moves its aliases there, and
        // the person is in it, but the bot is not and could not post.
        const hal = await freshPerson();
        const halMxid = matrixUserIdFor(hal.user.id)!;
        const shutdown = '!shutdown-replacement:test.local';
        matrix.rooms.set(shutdown, [
            { type: 'm.room.create', state_key: '', sender: '@admin:test.local', content: {} },
            memberEvent('@admin:test.local'),
            memberEvent(halMxid),
        ]);
        matrix.aliases.set(noticeRoomAlias(halMxid), shutdown);
        const hals = await released(await freshPerson(), [hal.keySet.identity]);
        matrix.clearCalls();
        assert.equal((await runDeadmanReleaseNotifier({ now: hals.at })).sent, 1);
        assert.deepEqual(matrix.stateReads, [shutdown]);
        assert.equal(matrix.sendsTo(shutdown).length, 0, 'nothing sent into the admin’s room');
        assert.equal(matrix.invites.length, 0, 'nobody invited into it');
        const halsRoom = roomWithout(halMxid);
        assert.equal(db.getDeadmanReleaseNotice(hals.record.id, hal.user.id)!.roomId, halsRoom);
        assert.equal(matrix.sendsTo(halsRoom).length, 1);
        matrix.aliases.delete(noticeRoomAlias(halMxid));

        // The alias names a room with no m.room.create yet: the homeserver
        // has taken the alias for a create still in progress. Retried, with
        // no other room made; once the room is there it is used.
        const ida = await freshPerson();
        const idaMxid = matrixUserIdFor(ida.user.id)!;
        const making = '!being-made:test.local';
        matrix.rooms.set(making, []);
        matrix.aliases.set(noticeRoomAlias(idaMxid), making);
        const idas = await released(await freshPerson(), [ida.keySet.identity]);
        matrix.clearCalls();
        assert.equal((await runDeadmanReleaseNotifier({ now: idas.at })).retried, 1);
        const waiting = db.getDeadmanReleaseNotice(idas.record.id, ida.user.id)!;
        assert.equal(waiting.lastError, 'matrix_alias_room_not_ready');
        assert.equal(waiting.roomId, undefined);
        assert.equal(matrix.creates.length, 0, 'no room made beside it');
        matrix.rooms.set(
            making,
            createdRoomState(matrix.botUserId, {
                invite: [idaMxid],
                power_level_content_override: { events_default: 50, invite: 50 },
            })
        );
        matrix.clearCalls();
        const idasRetry = dueAt({ switchId: idas.record.id, accountId: ida.user.id });
        assert.equal((await runDeadmanReleaseNotifier({ now: idasRetry })).sent, 1);
        assert.equal(matrix.creates.length, 0);
        assert.equal(matrix.invites.length, 0, 'the person was invited by the create itself');
        assert.equal(db.getDeadmanReleaseNotice(idas.record.id, ida.user.id)!.roomId, making);
        assert.equal(matrix.sendsTo(making).length, 1);
        matrix.aliases.delete(noticeRoomAlias(idaMxid));
    } finally {
        globalThis.fetch = matrix.fetch;
    }
});

test('a deletion that lands during the alias lookup, the bot’s id or a create without the alias is seen before anything more is asked or recorded', async () => {
    // Finding or making a room no row knows reads the row again after each
    // of its calls too (round 3 of part 2's review), as test 14 shows for the
    // create, the state read and the re-invite.
    const stubFetch = matrix.fetch;
    const gateFor = () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        return { gate, release };
    };
    const parkFetch = (
        match: (url: string, init?: RequestInit) => boolean,
        gate: Promise<void>
    ) => {
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
    const ended = { caughtUp: 0, due: 1, sent: 0, retried: 0, failed: 1, elsewhere: 0 };
    const endedRow = (switchId: string, accountId: string) => {
        const row = db.getDeadmanReleaseNotice(switchId, accountId)!;
        assert.equal(row.status, 'failed');
        assert.equal(row.lastError, 'recipient_gone');
        assert.equal(row.roomId, undefined, 'no room recorded on the ended row');
        assert.equal(row.attempts, 0);
    };
    // A room the bot made that holds the person's alias, as a create the
    // homeserver finished after the call timed out leaves it.
    const aliasedRoomFor = (personMxid: string, roomId: string) => {
        matrix.rooms.set(
            roomId,
            createdRoomState(matrix.botUserId, {
                invite: [personMxid],
                power_level_content_override: { events_default: 50, invite: 50 },
            })
        );
        matrix.aliases.set(noticeRoomAlias(personMxid), roomId);
    };

    // During the alias lookup: neither the bot's id nor the room the alias
    // names is asked for, and nothing is sent. (The bot's id is counted on a
    // stand-in, since the client answers it from its cache once known.)
    const first = await freshPerson();
    aliasedRoomFor(matrixUserIdFor(first.user.id)!, '!timed-out-1:test.local');
    const one = await released(await freshPerson(), [first.keySet.identity]);
    matrix.clearCalls();
    let botIdAsked = 0;
    const countingWhoami = {
        ...matrixClient,
        botUserId: async () => {
            botIdAsked += 1;
            return matrix.botUserId;
        },
    };
    try {
        const { gate, release } = gateFor();
        const tick = runDeadmanReleaseNotifier({ now: one.at, matrix: countingWhoami });
        parkFetch((url) => url.includes('/directory/room/'), gate);
        assert.deepEqual(await deleteDuring(tick, first, release), ended);
    } finally {
        globalThis.fetch = matrix.fetch;
    }
    endedRow(one.record.id, first.user.id);
    assert.equal(matrix.aliasReads.length, 1, 'the alias was asked for');
    assert.equal(botIdAsked, 0, 'the bot’s id was not asked for');
    assert.deepEqual(matrix.stateReads, [], 'the room it names was not read');
    assert.equal(matrix.sends.length, 0);

    // During the bot's own id (a stand-in, since the client caches it).
    const second = await freshPerson();
    aliasedRoomFor(matrixUserIdFor(second.user.id)!, '!timed-out-2:test.local');
    const two = await released(await freshPerson(), [second.keySet.identity]);
    matrix.clearCalls();
    {
        const { gate, release } = gateFor();
        const waitingWhoami = {
            ...matrixClient,
            botUserId: async () => {
                await gate;
                return matrix.botUserId;
            },
        };
        const tick = runDeadmanReleaseNotifier({ now: two.at, matrix: waitingWhoami });
        assert.deepEqual(await deleteDuring(tick, second, release), ended);
    }
    endedRow(two.record.id, second.user.id);
    assert.deepEqual(matrix.stateReads, [], 'the room the alias names was not read');
    assert.equal(matrix.sends.length, 0);

    // During a create without the alias, the alias refused: the room is made
    // (the homeserver was asked) but not recorded, and nothing is sent.
    const third = await freshPerson();
    const three = await released(await freshPerson(), [third.keySet.identity]);
    matrix.clearCalls();
    matrix.aliasRefusal = { status: 403, errcode: 'M_UNKNOWN' };
    try {
        const { gate, release } = gateFor();
        const tick = runDeadmanReleaseNotifier({ now: three.at });
        parkFetch(
            (url, init) =>
                url.includes('/createRoom') && !String(init?.body).includes('room_alias_name'),
            gate
        );
        assert.deepEqual(await deleteDuring(tick, third, release), ended);
    } finally {
        matrix.aliasRefusal = null;
        globalThis.fetch = matrix.fetch;
    }
    endedRow(three.record.id, third.user.id);
    assert.equal(matrix.createRefusals.length, 1, 'the create with the alias was refused');
    assert.equal(matrix.creates.length, 1, 'the one without it was made');
    assert.equal(matrix.sendsTo(matrix.creates[0].roomId).length, 0, 'nothing sent into it');
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
    let first: ReturnType<typeof runDeadmanReleaseNotifier> | undefined;
    try {
        first = runDeadmanReleaseNotifier({ now: at });
        // Let the first tick reach the homeserver before the second starts.
        await new Promise((resolve) => setTimeout(resolve, 20));
        // A bounded wait: without the in-flight guard the second tick would
        // wait on the first's room slot, and this would fail, not hang.
        const second = await within(1500, runDeadmanReleaseNotifier({ now: at }));
        assert.deepEqual(
            second,
            { caughtUp: 0, due: 1, sent: 0, retried: 0, failed: 0, elsewhere: 1 },
            'the second tick left it alone, counted it as another tick’s, and finished'
        );
        release();
        assert.equal((await first).sent, 1);
    } finally {
        // Released whatever the assertions said, so that a failure here does
        // not leave this notice in flight under the tests after it.
        release();
        await within(5000, first ?? Promise.resolve());
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
    assert.deepEqual(first, {
        caughtUp: 0,
        due: 50,
        sent: 50,
        retried: 0,
        failed: 0,
        elsewhere: 0,
    });
    assert.equal(
        db.listDeadmanReleaseNotices(record.id).filter((n) => n.status === 'pending').length,
        1
    );
    const second = await runDeadmanReleaseNotifier({ now: at });
    assert.deepEqual(second, { caughtUp: 0, due: 1, sent: 1, retried: 0, failed: 0, elsewhere: 0 });
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
    assert.deepEqual(result, { caughtUp: 0, due: 0, sent: 0, retried: 0, failed: 0, elsewhere: 0 });
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
        assert.deepEqual(result, {
            caughtUp: 0,
            due: 2,
            sent: 1,
            retried: 0,
            failed: 0,
            elsewhere: 0,
        });
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

test('a room found through the alias that is still not the whole room the create makes, with the bot in it, at the notice’s next attempt (no events, the create alone, the create and the bot’s join, a room the bot has left, or power levels that let the person post or invite, by the defaults or by their own level) is waited for once, as a create in progress, and then replaced: a room is made without the alias, nobody is invited into the old one, and later notices reuse the new room', async () => {
    // The homeserver writes the alias after it makes the room id and before
    // it sends any event (`handlers/room.py`, `create_room`), and then writes
    // the room in steps (`_send_events_for_new_room`: m.room.create alone,
    // the creator's join, then one batch with the power levels and the rest).
    // A restart or a failure between any two leaves the alias naming that
    // prefix for good. Retried as a room still being made, the empty one
    // stopped every notice to the person for the whole window (round 4 of
    // part 2's review); the create alone was taken as the bot's and its
    // re-invite refused for the window (M_NOT_JOINED), and the create with
    // the bot's join was used with no power levels (round 5). The last two
    // shapes pin the check's other halves: the person must not be able to
    // invite either, and their own level in `users` counts over the default
    // (round 6).
    pushEarlierRowsOut();
    const bot = matrix.botUserId;
    const create = { type: 'm.room.create', state_key: '', sender: bot, content: {} };
    const shapes: Array<[string, (personMxid: string) => Array<Record<string, unknown>>]> = [
        ['no events', () => []],
        ['the create alone', () => [create]],
        ['the create and the bot’s join', () => [create, memberEvent(bot)]],
        [
            'the whole room, which the bot has since left',
            (personMxid) => [
                ...createdRoomState(bot, {
                    invite: [personMxid],
                    power_level_content_override: { events_default: 50, invite: 50 },
                }).filter((e) => !(e.type === 'm.room.member' && e.state_key === bot)),
                memberEvent(bot, 'leave'),
            ],
        ],
        [
            'power levels that let the person post',
            (personMxid) => [
                create,
                memberEvent(bot),
                {
                    type: 'm.room.power_levels',
                    state_key: '',
                    content: { users: { [bot]: 100 }, users_default: 0, invite: 50 },
                },
                memberEvent(personMxid, 'invite'),
            ],
        ],
        [
            'power levels that keep the person from posting but let them invite',
            (personMxid) => [
                create,
                memberEvent(bot),
                {
                    type: 'm.room.power_levels',
                    state_key: '',
                    content: {
                        users: { [bot]: 100 },
                        users_default: 0,
                        events_default: 50,
                        invite: 0,
                    },
                },
                memberEvent(personMxid, 'invite'),
            ],
        ],
        [
            'power levels that give the person their own level of 100',
            (personMxid) => [
                create,
                memberEvent(bot),
                {
                    type: 'm.room.power_levels',
                    state_key: '',
                    content: {
                        users: { [bot]: 100, [personMxid]: 100 },
                        users_default: 0,
                        events_default: 50,
                        invite: 50,
                    },
                },
                memberEvent(personMxid, 'invite'),
            ],
        ],
    ];
    for (const [index, [shape, stateFor]] of shapes.entries()) {
        const mo = await freshPerson();
        const moMxid = matrixUserIdFor(mo.user.id)!;
        const abandoned = `!abandoned-${index}:test.local`;
        matrix.rooms.set(abandoned, stateFor(moMxid) as never);
        matrix.aliases.set(noticeRoomAlias(moMxid), abandoned);
        const first = await released(await freshPerson(), [mo.keySet.identity]);
        const row = { switchId: first.record.id, accountId: mo.user.id };

        // The first look: taken for a create still in progress, retried, and
        // nothing made beside it, nobody invited into it.
        matrix.clearCalls();
        assert.deepEqual(
            await runDeadmanReleaseNotifier({ now: first.at }),
            { caughtUp: 0, due: 1, sent: 0, retried: 1, failed: 0, elsewhere: 0 },
            shape
        );
        assert.equal(
            db.getDeadmanReleaseNotice(first.record.id, mo.user.id)!.lastError,
            'matrix_alias_room_not_ready',
            shape
        );
        assert.equal(matrix.creates.length, 0, `${shape}: no room made beside it yet`);
        assert.equal(matrix.invites.length, 0, `${shape}: nobody invited into it`);

        // One backoff later it is still so: a room without the alias.
        matrix.clearCalls();
        assert.deepEqual(
            await runDeadmanReleaseNotifier({ now: dueAt(row) }),
            { caughtUp: 0, due: 1, sent: 1, retried: 0, failed: 0, elsewhere: 0 },
            shape
        );
        assert.deepEqual(
            matrix.createRefusals.map((r) => r.errcode),
            ['M_ROOM_IN_USE'],
            `${shape}: the alias was still taken`
        );
        assert.deepEqual(matrix.stateReads, [abandoned], shape);
        assert.equal(matrix.creates.length, 1, shape);
        assert.equal(matrix.invites.length, 0, `${shape}: no re-invite into the abandoned room`);
        const [plain] = matrix.creates;
        assert.equal(plain.body.room_alias_name, undefined, `${shape}: made without the alias`);
        assert.deepEqual(plain.body.invite, [moMxid]);
        const sent = db.getDeadmanReleaseNotice(first.record.id, mo.user.id)!;
        assert.equal(sent.status, 'sent', shape);
        assert.equal(sent.roomId, plain.roomId, shape);
        assert.equal(matrix.sendsTo(plain.roomId).length, 1, shape);
        assert.equal(matrix.sendsTo(abandoned).length, 0, shape);

        // A later release to the person reuses that room through the rows: no
        // create, no alias lookup, no wait.
        const later = await released(await freshPerson(), [mo.keySet.identity]);
        matrix.clearCalls();
        assert.equal((await runDeadmanReleaseNotifier({ now: later.at })).sent, 1, shape);
        assert.equal(matrix.creates.length + matrix.createRefusals.length, 0, shape);
        assert.equal(matrix.aliasReads.length, 0, shape);
        assert.equal(
            db.getDeadmanReleaseNotice(later.record.id, mo.user.id)!.roomId,
            plain.roomId,
            shape
        );
        assert.equal(matrix.sendsTo(plain.roomId).length, 1, shape);
        matrix.aliases.delete(noticeRoomAlias(moMxid));
    }

    // The whole room, found through the alias, is used at the first look.
    const whole = await freshPerson();
    const wholeMxid = matrixUserIdFor(whole.user.id)!;
    const complete = '!complete-through-alias:test.local';
    matrix.rooms.set(
        complete,
        createdRoomState(bot, {
            invite: [wholeMxid],
            power_level_content_override: { events_default: 50, invite: 50 },
        })
    );
    matrix.aliases.set(noticeRoomAlias(wholeMxid), complete);
    const wholes = await released(await freshPerson(), [whole.keySet.identity]);
    matrix.clearCalls();
    assert.equal((await runDeadmanReleaseNotifier({ now: wholes.at })).sent, 1);
    assert.equal(matrix.creates.length, 0);
    assert.equal(db.getDeadmanReleaseNotice(wholes.record.id, whole.user.id)!.roomId, complete);
    matrix.aliases.delete(noticeRoomAlias(wholeMxid));
});

test('a notice another process sent while this tick had it in hand is counted as another’s, not as failed, and left as it is', async () => {
    // Two notifiers on one store (two processes during a leader handover,
    // say): the one that finds the row already sent when it is done with it
    // counted it as failed, so its log said failed for a delivered notice
    // (round 4 of part 2's review).
    pushEarlierRowsOut();
    const nan = await freshPerson();
    const { record, at } = await released(await freshPerson(), [nan.keySet.identity]);
    matrix.clearCalls();
    const sentAt = new Date().toISOString();
    const stubFetch = matrix.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
            typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/createRoom')) {
            // The other process's send lands while this tick asks for a room.
            db.updateDeadmanReleaseNotice(record.id, nan.user.id, {
                status: 'sent',
                attempts: 1,
                sentAt,
                roomId: '!the-other-process:test.local',
            });
        }
        return stubFetch(input, init);
    }) as typeof fetch;
    let result: Awaited<ReturnType<typeof runDeadmanReleaseNotifier>>;
    try {
        result = await runDeadmanReleaseNotifier({ now: at });
    } finally {
        globalThis.fetch = matrix.fetch;
    }
    assert.deepEqual(result, {
        caughtUp: 0,
        due: 1,
        sent: 0,
        retried: 0,
        failed: 0,
        elsewhere: 1,
    });
    const row = db.getDeadmanReleaseNotice(record.id, nan.user.id)!;
    assert.equal(row.status, 'sent');
    assert.equal(row.attempts, 1);
    assert.equal(row.sentAt, sentAt);
    assert.equal(row.lastError, undefined);
    assert.equal(row.roomId, '!the-other-process:test.local', 'nothing of this tick’s recorded');
    assert.equal(matrix.sends.length, 0, 'this tick sent nothing');
});

test('a retry is timed from when it was recorded, not from the tick’s start: after a long tick the second look at a room found through the alias still comes a whole backoff after the first', async () => {
    // As round 4 built it the retry was timed from the tick's start, so a
    // notice reached late in a tick (here behind a create that ran to the
    // call timeout) could be due again as it was written, and its second
    // look at a room still being made came seconds after the first, which
    // took a create merely in progress for an abandoned one (round 5 of
    // part 2's review).
    pushEarlierRowsOut();
    const callTimeoutMs = 300;
    const held = await freshPerson();
    const heldMxid = matrixUserIdFor(held.user.id)!;
    const late = await freshPerson();
    const lateMxid = matrixUserIdFor(late.user.id)!;
    const at = soon();
    const heldRelease = await released(await freshPerson(), [held.keySet.identity], at);
    await new Promise((resolve) => setTimeout(resolve, 5)); // the late row after the held one
    const lateRelease = await released(await freshPerson(), [late.keySet.identity], at);
    const lateRow = { switchId: lateRelease.record.id, accountId: late.user.id };
    const inProgress = '!still-being-made:test.local';
    matrix.rooms.set(inProgress, []);
    matrix.aliases.set(noticeRoomAlias(lateMxid), inProgress);
    const looks: number[] = [];
    matrix.onStateRead = (roomId) => {
        if (roomId === inProgress) looks.push(Date.now());
    };
    const stubFetch = matrix.fetch;
    let release!: () => void;
    const never = new Promise<void>((resolve) => {
        release = resolve;
    });
    let hangOnce = true;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
            typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/createRoom') && String(init?.body).includes(heldMxid) && hangOnce) {
            hangOnce = false;
            await never; // the homeserver never answers this one
        }
        return stubFetch(input, init);
    }) as typeof fetch;
    try {
        // The first tick: the held create runs to its timeout, then the late
        // notice's first look finds the alias room with no events.
        matrix.clearCalls();
        const first = await runDeadmanReleaseNotifier({ now: at, callTimeoutMs });
        assert.deepEqual(first, {
            caughtUp: 0,
            due: 2,
            sent: 0,
            retried: 2,
            failed: 0,
            elsewhere: 0,
        });
        assert.equal(looks.length, 1);
        const waiting = db.getDeadmanReleaseNotice(lateRow.switchId, lateRow.accountId)!;
        assert.equal(waiting.lastError, 'matrix_alias_room_not_ready');
        assert.ok(
            Date.parse(waiting.nextAttemptAt) >=
                at.getTime() + callTimeoutMs + NOTICE_BACKOFF_FIRST_MS,
            'due a backoff after the look, which came after the hung call’s timeout'
        );

        // When the old timing would have had it due, it is not: no second look.
        const oldTiming = new Date(at.getTime() + NOTICE_BACKOFF_FIRST_MS);
        assert.equal((await runDeadmanReleaseNotifier({ now: oldTiming, callTimeoutMs })).due, 0);
        assert.equal(looks.length, 1, 'no second look at the old time');

        // At its own time: the second look, a whole backoff after the first on
        // the tick's clock, and the room is made without the alias.
        matrix.clearCalls();
        const second = await runDeadmanReleaseNotifier({ now: dueAt(lateRow), callTimeoutMs });
        assert.equal(second.sent, 2, 'both notices, the held one’s create answered this time');
        assert.equal(looks.length, 2);
        const done = db.getDeadmanReleaseNotice(lateRow.switchId, lateRow.accountId)!;
        assert.equal(done.status, 'sent');
        const plain = matrix.creates.find((c) => (c.body.invite as string[]).includes(lateMxid));
        assert.ok(plain, 'a room made for the late notice');
        assert.equal(plain.body.room_alias_name, undefined, 'without the alias');
        assert.equal(done.roomId, plain.roomId);
        assert.equal(
            db.getDeadmanReleaseNotice(heldRelease.record.id, held.user.id)!.status,
            'sent'
        );
    } finally {
        release();
        globalThis.fetch = matrix.fetch;
        matrix.onStateRead = null;
        matrix.aliases.delete(noticeRoomAlias(lateMxid));
    }
});
