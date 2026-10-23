import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';
import {
    createMatrixStub,
    encryptionEvent,
    memberEvent,
    powerLevelsEvent,
    type StubStateEvent,
} from './_fixtures/matrixStub';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api-test';
process.env.JWT_AUDIENCE = 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.MATRIX_HOMESERVER = 'https://matrix.test.local';
process.env.MATRIX_BOT_TOKEN = 'syt_test_admin_token';
// matrixUserIdFor() maps a Blackout user to @<username>:<this domain>; it must
// match the stub homeserver's domain or every author reads as "not a member".
process.env.MATRIX_HOMESERVER_DOMAIN = 'test.local';

const matrix = createMatrixStub({ domain: 'test.local' });
globalThis.fetch = matrix.fetch;

const { default: app } = await import('../src/index');
const { signJwt, hashPassword } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { runScheduledMessageDispatch, SCHEDULED_MESSAGE_EXPIRED_REASON } = await import(
    '../src/services/scheduledMessageDispatcher'
);
const { backlogToleranceMs } = await import('../src/services/backlogTolerance');
const mailerModule = await import('../src/services/mailer');

class InMemoryMailer {
    outbox: Array<{ to: string; subject: string; text: string; kind?: string }> = [];
    async send(message: { to: string; subject: string; text: string; kind?: string }) {
        this.outbox.push(message);
    }
}
const mailer = new InMemoryMailer();
mailerModule.setMailer(mailer);

const seedUser = () => {
    const id = randomUUID();
    const username = `user-${id.slice(0, 8)}`;
    db.createUser({
        id,
        username,
        email: `${username}@example.com`,
        passwordHash: hashPassword('Original-Pass-1234!'),
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: 'pk',
    });
    return db.getUserById(id)!;
};

const bearer = (userId: string, username: string) => ({
    authorization: `Bearer ${signJwt(userId, username, 600)}`,
    'content-type': 'application/json',
});

const futureIso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const newRoomId = (label: string) => `!${label}-${randomUUID().slice(0, 8)}:test.local`;

/** Seed a room's state on the stub homeserver and return its id. */
const seedRoom = (label: string, state: StubStateEvent[] | number): string => {
    const roomId = newRoomId(label);
    matrix.rooms.set(roomId, state);
    return roomId;
};

/** An unencrypted room where `username` and the bot are joined. */
const joinedRoom = (label: string, username: string, extra: StubStateEvent[] = []) =>
    seedRoom(label, [memberEvent(matrix.mxid(username)), memberEvent(matrix.botUserId), ...extra]);

const schedule = (
    user: { id: string; username: string },
    matrixRoomId: string,
    body: string,
    deliverAt = futureIso(HOUR),
    formattedBody?: string
) =>
    app.request('/v1/scheduled-messages', {
        method: 'POST',
        headers: bearer(user.id, user.username),
        body: JSON.stringify({ matrixRoomId, body, deliverAt, formattedBody }),
    });

const rowsForRoom = (roomId: string) =>
    [...db.scheduledMessages.values()].filter((m) => m.matrixRoomId === roomId);

const codeOf = async (res: Response) => ((await res.json()) as { code: string }).code;

test('POST /v1/scheduled-messages stores a pending message for a joined member (T8)', async () => {
    const user = seedUser();
    const roomId = joinedRoom('happy', user.username);
    const res = await schedule(user, roomId, 'hello later');
    assert.equal(res.status, 201);
    const body = (await res.json()) as {
        scheduledMessage: { id: string; status: string; userId: string };
    };
    assert.equal(body.scheduledMessage.status, 'pending');
    assert.equal(body.scheduledMessage.userId, user.id);
    assert.ok(matrix.stateReads.includes(roomId), 'the room state was actually read');
});

test('POST /v1/scheduled-messages rejects a deliverAt in the past', async () => {
    const user = seedUser();
    const res = await schedule(
        user,
        joinedRoom('past', user.username),
        'too late',
        futureIso(-60_000)
    );
    assert.equal(res.status, 400);
    assert.equal(await codeOf(res), 'deliver_at_in_past');
});

test('POST /v1/scheduled-messages refuses a deliverAt more than 30 days ahead (T10)', async () => {
    const user = seedUser();
    const roomId = joinedRoom('far', user.username);
    const res = await schedule(user, roomId, 'next month', futureIso(31 * DAY));
    assert.equal(res.status, 400);
    assert.equal(await codeOf(res), 'deliver_at_too_far');
    assert.equal(rowsForRoom(roomId).length, 0);

    // 29 days is inside the ceiling.
    const ok = await schedule(user, roomId, 'in four weeks', futureIso(29 * DAY));
    assert.equal(ok.status, 201);
});

test('POST /v1/scheduled-messages requires authentication', async () => {
    const res = await app.request('/v1/scheduled-messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            matrixRoomId: '!room:test.local',
            body: 'no auth',
            deliverAt: futureIso(60 * 1000),
        }),
    });
    assert.equal(res.status, 401);
});

test('POST refuses an author who is not in the room, and stores and sends nothing (T1)', async () => {
    const user = seedUser();
    const roomId = seedRoom('notmember', [memberEvent(matrix.botUserId)]);
    matrix.clearCalls();
    const res = await schedule(user, roomId, 'let me in');
    assert.equal(res.status, 403);
    assert.equal(await codeOf(res), 'not_room_member');
    assert.equal(rowsForRoom(roomId).length, 0, 'no row stored for the room');

    // Even when the row would be due, nothing exists to send.
    await runScheduledMessageDispatch();
    assert.equal(matrix.sendsTo(roomId).length, 0, 'no send into the room');
});

test('a non-member learns "not a member" even when the room is encrypted (T2)', async () => {
    const user = seedUser();
    const roomId = seedRoom('notmember-enc', [memberEvent(matrix.botUserId), encryptionEvent()]);
    const res = await schedule(user, roomId, 'probe');
    assert.equal(res.status, 403, 'membership is checked before encryption');
    assert.equal(await codeOf(res), 'not_room_member');
});

test('a non-member learns "not a member" even when the bot is not in the room either (T2b)', async () => {
    const user = seedUser();
    const roomId = seedRoom('notmember-nobot', []);
    const res = await schedule(user, roomId, 'probe');
    assert.equal(res.status, 403, 'the author is checked before the bot');
    assert.equal(await codeOf(res), 'not_room_member');
    assert.equal(rowsForRoom(roomId).length, 0);
});

test('an unknown room answers exactly like a room the author is not in', async () => {
    const user = seedUser();
    const res = await schedule(user, newRoomId('unknown'), 'probe');
    assert.equal(res.status, 403);
    assert.equal(await codeOf(res), 'not_room_member');
});

test('a member who has left the room is refused (T3)', async () => {
    const user = seedUser();
    const roomId = seedRoom('left', [
        memberEvent(matrix.mxid(user.username), 'leave'),
        memberEvent(matrix.botUserId),
    ]);
    const res = await schedule(user, roomId, 'still here?');
    assert.equal(res.status, 403);
    assert.equal(await codeOf(res), 'not_room_member');

    // Only `join` counts: an invited, banned or knocking member is not in the room.
    for (const membership of ['invite', 'ban', 'knock']) {
        const other = seedRoom(`not-joined-${membership}`, [
            memberEvent(matrix.mxid(user.username), membership),
            memberEvent(matrix.botUserId),
        ]);
        const refused = await schedule(user, other, 'still here?');
        assert.equal(refused.status, 403, `membership "${membership}" is refused`);
        assert.equal(await codeOf(refused), 'not_room_member');
        assert.equal(rowsForRoom(other).length, 0);
    }
});

test('a member without power to post is refused (T4)', async () => {
    const user = seedUser();
    const roomId = joinedRoom('muted', user.username, [
        powerLevelsEvent({ events_default: 50, users: { [matrix.botUserId]: 100 } }),
    ]);
    const res = await schedule(user, roomId, 'speaking through the bot');
    assert.equal(res.status, 403);
    assert.equal(await codeOf(res), 'insufficient_power');
    assert.equal(rowsForRoom(roomId).length, 0);

    // The same room lets a member whose level reaches events_default post.
    const moderator = seedUser();
    matrix.rooms.set(roomId, [
        memberEvent(matrix.mxid(moderator.username)),
        memberEvent(matrix.botUserId),
        powerLevelsEvent({ events_default: 50, users: { [matrix.mxid(moderator.username)]: 50 } }),
    ]);
    const ok = await schedule(moderator, roomId, 'moderator note');
    assert.equal(ok.status, 201);
});

test('a joined member is refused in an encrypted room, with nothing stored or sent (T5)', async () => {
    const user = seedUser();
    const roomId = joinedRoom('enc', user.username, [encryptionEvent()]);
    matrix.clearCalls();
    const res = await schedule(user, roomId, 'secret plans');
    assert.equal(res.status, 409);
    assert.equal(await codeOf(res), 'room_encrypted');
    assert.equal(rowsForRoom(roomId).length, 0);
    await runScheduledMessageDispatch();
    assert.equal(matrix.sendsTo(roomId).length, 0);
});

test('a room the bot is not in is refused (T6)', async () => {
    const user = seedUser();
    const roomId = seedRoom('nobot', [memberEvent(matrix.mxid(user.username))]);
    const res = await schedule(user, roomId, 'nobody to deliver this');
    assert.equal(res.status, 409);
    assert.equal(await codeOf(res), 'bot_not_in_room');
});

test('a failed room check refuses with 503 and stores nothing (T7)', async () => {
    const user = seedUser();
    const roomId = seedRoom('outage', 500);
    const res = await schedule(user, roomId, 'during an outage');
    assert.equal(res.status, 503);
    assert.equal(await codeOf(res), 'room_check_unavailable');
    assert.equal(rowsForRoom(roomId).length, 0);
});

test('GET then DELETE manages a user pending queue, and cancelling clears the text (R-2)', async () => {
    const user = seedUser();
    const create = await schedule(user, joinedRoom('cancel', user.username), 'cancel me');
    assert.equal(create.status, 201);
    const { scheduledMessage } = (await create.json()) as { scheduledMessage: { id: string } };

    const list = await app.request('/v1/scheduled-messages', {
        headers: bearer(user.id, user.username),
    });
    const listBody = (await list.json()) as { scheduledMessages: Array<{ id: string }> };
    assert.ok(listBody.scheduledMessages.some((m) => m.id === scheduledMessage.id));

    const del = await app.request(`/v1/scheduled-messages/${scheduledMessage.id}`, {
        method: 'DELETE',
        headers: bearer(user.id, user.username),
    });
    assert.equal(del.status, 200);
    const cancelled = db.getScheduledMessage(scheduledMessage.id);
    assert.equal(cancelled?.status, 'cancelled');
    assert.equal(cancelled?.body, '', 'a cancelled message keeps no text');

    // Second cancel is a no-op (already cancelled, no longer pending) → 404.
    const delAgain = await app.request(`/v1/scheduled-messages/${scheduledMessage.id}`, {
        method: 'DELETE',
        headers: bearer(user.id, user.username),
    });
    assert.equal(delAgain.status, 404);
});

test('dispatcher delivers a due message and the event carries no Blackout user id (F6)', async () => {
    matrix.sendStatus = 200;
    const user = seedUser();
    const roomId = joinedRoom('due', user.username);
    const record = db.createScheduledMessage({
        id: randomUUID(),
        userId: user.id,
        matrixRoomId: roomId,
        body: 'deliver now',
        deliverAt: futureIso(-1000), // already due
    });

    const result = await runScheduledMessageDispatch();
    assert.ok(result.delivered >= 1);

    const sent = matrix.sendsTo(roomId);
    assert.equal(sent.length, 1, 'expected one Matrix send for the due room');
    assert.ok(sent[0].raw.includes('deliver now'));
    assert.ok(sent[0].raw.includes(user.username), 'attributed to the author by username');
    assert.ok(!sent[0].raw.includes(user.id), 'the internal user id never reaches the room');
    assert.deepEqual(Object.keys(sent[0].body['co.blackout.scheduled'] as object).sort(), [
        'deliver_at',
        'scheduled_message_id',
    ]);

    assert.equal(db.getScheduledMessage(record.id)?.status, 'delivered');
});

test('a delivered message keeps no text (R-1)', async () => {
    matrix.sendStatus = 200;
    const user = seedUser();
    const roomId = joinedRoom('retain', user.username);
    const record = db.createScheduledMessage({
        id: randomUUID(),
        userId: user.id,
        matrixRoomId: roomId,
        body: 'plain words',
        formattedBody: '<em>rich words</em>',
        deliverAt: futureIso(-1000),
    });
    await runScheduledMessageDispatch();
    assert.equal(matrix.sendsTo(roomId).length, 1);
    assert.ok(matrix.sendsTo(roomId)[0].raw.includes('rich words'), 'the send had the text');

    const after = db.getScheduledMessage(record.id);
    assert.equal(after?.status, 'delivered');
    assert.equal(after?.body, '');
    assert.equal(after?.formattedBody, undefined);
});

test('dispatcher retries a failed send, then fails it after max attempts and clears it (R-3)', async () => {
    matrix.sendStatus = 500;
    const user = seedUser();
    const record = db.createScheduledMessage({
        id: randomUUID(),
        userId: user.id,
        matrixRoomId: joinedRoom('fail', user.username),
        body: 'will fail',
        formattedBody: '<b>will fail</b>',
        deliverAt: futureIso(-1000),
    });

    try {
        // First failure keeps it pending, text intact, for a later retry.
        await runScheduledMessageDispatch();
        assert.equal(db.getScheduledMessage(record.id)?.status, 'pending');
        assert.equal(db.getScheduledMessage(record.id)?.attempts, 1);
        assert.equal(db.getScheduledMessage(record.id)?.body, 'will fail');

        // Exhaust the remaining attempts (MAX_ATTEMPTS = 5).
        for (let i = 0; i < 4; i += 1) {
            await runScheduledMessageDispatch();
        }
        const after = db.getScheduledMessage(record.id);
        assert.equal(after?.status, 'failed');
        assert.equal(after?.attempts, 5);
        assert.equal(after?.body, '');
        assert.equal(after?.formattedBody, undefined);
    } finally {
        matrix.sendStatus = 200;
    }
});

test('dispatcher re-checks the room: no send for a non-member or an encrypted room (T9)', async () => {
    const author = seedUser();
    const notJoined = seedRoom('t9a', [memberEvent(matrix.botUserId)]);
    const encrypted = joinedRoom('t9b', author.username, [encryptionEvent()]);
    // Rows made directly, bypassing POST: rows stored before the POST check
    // existed, or rooms that changed after scheduling.
    const a = db.createScheduledMessage({
        id: randomUUID(),
        userId: author.id,
        matrixRoomId: notJoined,
        body: 'old row, author never joined',
        deliverAt: futureIso(-1000),
    });
    const b = db.createScheduledMessage({
        id: randomUUID(),
        userId: author.id,
        matrixRoomId: encrypted,
        body: 'room became encrypted',
        deliverAt: futureIso(-1000),
    });

    const result = await runScheduledMessageDispatch();
    assert.ok(result.refused >= 2);
    assert.equal(matrix.sendsTo(notJoined).length, 0);
    assert.equal(matrix.sendsTo(encrypted).length, 0);
    assert.equal(db.getScheduledMessage(a.id)?.status, 'failed');
    assert.equal(db.getScheduledMessage(a.id)?.lastError, 'refused_not_room_member');
    assert.equal(db.getScheduledMessage(a.id)?.body, '');
    assert.equal(db.getScheduledMessage(b.id)?.status, 'failed');
    assert.equal(db.getScheduledMessage(b.id)?.lastError, 'refused_room_encrypted');
});

test('dispatcher keeps a message pending when the room check is unavailable', async () => {
    const author = seedUser();
    const roomId = seedRoom('t11', 503);
    const record = db.createScheduledMessage({
        id: randomUUID(),
        userId: author.id,
        matrixRoomId: roomId,
        body: 'wait for the homeserver',
        deliverAt: futureIso(-1000),
    });
    try {
        await runScheduledMessageDispatch();
        const after = db.getScheduledMessage(record.id);
        assert.equal(after?.status, 'pending', 'an outage is retried, not a refusal');
        assert.equal(after?.attempts, 1);
        assert.equal(after?.lastError, 'room_check_unavailable');
        assert.equal(after?.body, 'wait for the homeserver');
        assert.equal(matrix.sendsTo(roomId).length, 0);
    } finally {
        db.cancelScheduledMessage(record.id, author.id);
    }
});

test('dispatcher does not send a message cancelled while its room was being checked', async () => {
    const author = seedUser();
    const roomId = joinedRoom('race', author.username);
    const record = db.createScheduledMessage({
        id: randomUUID(),
        userId: author.id,
        matrixRoomId: roomId,
        body: 'cancelled mid-check',
        deliverAt: futureIso(-1000),
    });
    matrix.onStateRead = (readRoom) => {
        if (readRoom === roomId) db.cancelScheduledMessage(record.id, author.id);
    };
    try {
        await runScheduledMessageDispatch();
    } finally {
        matrix.onStateRead = null;
    }
    assert.equal(matrix.sendsTo(roomId).length, 0);
    assert.equal(db.getScheduledMessage(record.id)?.status, 'cancelled');
});

test('a row whose author no longer exists is never posted (D-2)', async () => {
    const ghostId = randomUUID();
    const roomId = newRoomId('ghost');
    matrix.rooms.set(roomId, [memberEvent(matrix.botUserId)]);
    const record = db.createScheduledMessage({
        id: randomUUID(),
        userId: ghostId,
        matrixRoomId: roomId,
        body: 'from beyond',
        deliverAt: futureIso(-1000),
    });
    matrix.clearCalls();
    await runScheduledMessageDispatch();
    assert.equal(matrix.sends.length, 0, 'no send at all this tick');
    assert.ok(!matrix.sends.some((s) => s.raw.includes(ghostId)));
    const after = db.getScheduledMessage(record.id);
    assert.equal(after?.status, 'failed');
    assert.equal(after?.lastError, 'refused_author_unknown');
});

test('deleting an account erases its scheduled messages and nothing is posted (D-1)', async () => {
    const user = seedUser();
    const roomId = joinedRoom('deleted', user.username);
    const secret = `farewell-${randomUUID()}`;
    const scheduled = await schedule(user, roomId, secret, futureIso(HOUR), `<b>${secret}</b>`);
    assert.equal(scheduled.status, 201);
    const { scheduledMessage } = (await scheduled.json()) as { scheduledMessage: { id: string } };
    // A second, already delivered row of the same author.
    const old = db.createScheduledMessage({
        id: randomUUID(),
        userId: user.id,
        matrixRoomId: roomId,
        body: 'already sent',
        deliverAt: futureIso(-1000),
    });
    db.markScheduledMessageDelivered(old.id);

    mailer.outbox.length = 0;
    const requested = await app.request('/v1/auth/account/delete/request', {
        method: 'POST',
        headers: bearer(user.id, user.username),
    });
    assert.equal(requested.status, 202);
    const mail = mailer.outbox.find((m) => m.kind === 'account_deletion');
    const token = mail?.text.match(/confirm deletion: (\S+)/)?.[1];
    assert.ok(token, 'the deletion email carries a token');

    const confirmed = await app.request('/v1/auth/account/delete/confirm', {
        method: 'POST',
        headers: bearer(user.id, user.username),
        body: JSON.stringify({ token }),
    });
    assert.equal(confirmed.status, 200);
    assert.equal(db.getUserById(user.id), undefined);

    // Make the erased row due, as if its delivery time had come.
    const erased = db.getScheduledMessage(scheduledMessage.id);
    assert.ok(erased);
    db.scheduledMessages.set(erased.id, { ...erased, deliverAt: futureIso(-1000) });

    matrix.clearCalls();
    await runScheduledMessageDispatch();
    assert.equal(matrix.sends.length, 0, 'nothing is posted for the deleted account');

    const rows = [...db.scheduledMessages.values()];
    assert.ok(!rows.some((m) => m.userId === user.id), 'no row still names the user');
    assert.ok(
        !rows.some((m) => m.body.includes(secret) || (m.formattedBody ?? '').includes(secret)),
        'no row still holds the text'
    );
    const after = db.getScheduledMessage(scheduledMessage.id);
    assert.equal(after?.status, 'cancelled');
    assert.equal(after?.lastError, 'author_deleted');
    assert.equal(after?.matrixRoomId, '');
    assert.equal(db.getScheduledMessage(old.id)?.userId, '');
});

const MINUTE = 60 * 1000;

test('a message the dispatcher reaches more than 15 minutes late expires: no room check, no send, no text (B-1)', async () => {
    matrix.sendStatus = 200;
    const user = seedUser();
    const roomId = joinedRoom('overdue', user.username);
    const record = db.createScheduledMessage({
        id: randomUUID(),
        userId: user.id,
        matrixRoomId: roomId,
        body: 'the meeting starts now',
        formattedBody: '<b>the meeting starts now</b>',
        deliverAt: futureIso(-20 * MINUTE),
    });
    matrix.clearCalls();

    const result = await runScheduledMessageDispatch();
    assert.ok(result.expired >= 1);
    assert.equal(matrix.sendsTo(roomId).length, 0, 'not sent late');
    assert.ok(!matrix.stateReads.includes(roomId), 'expired before any homeserver call');

    const row = db.getScheduledMessage(record.id);
    assert.equal(row?.status, 'failed');
    assert.equal(row?.lastError, SCHEDULED_MESSAGE_EXPIRED_REASON);
    assert.equal(SCHEDULED_MESSAGE_EXPIRED_REASON, 'expired_overdue');
    assert.equal(row?.body, '', 'an expired message keeps no text');
    assert.equal(row?.formattedBody, undefined);
    assert.equal(row?.deliveredAt, undefined);

    // Finished: a later tick leaves it alone.
    await runScheduledMessageDispatch();
    assert.equal(matrix.sendsTo(roomId).length, 0);
    assert.equal(db.getScheduledMessage(record.id)?.attempts, row?.attempts);
});

test('a message reached late but inside the tolerance is still sent (B-2)', async () => {
    matrix.sendStatus = 200;
    const user = seedUser();
    const roomId = joinedRoom('late-but-sent', user.username);
    const record = db.createScheduledMessage({
        id: randomUUID(),
        userId: user.id,
        matrixRoomId: roomId,
        body: 'ten minutes late',
        deliverAt: futureIso(-10 * MINUTE),
    });
    await runScheduledMessageDispatch();
    assert.equal(matrix.sendsTo(roomId).length, 1);
    assert.equal(db.getScheduledMessage(record.id)?.status, 'delivered');
});

test('the tolerance is 15 minutes, or ten dispatch intervals when that is longer (B-3)', async () => {
    assert.equal(backlogToleranceMs(30 * 1000), 15 * MINUTE);
    assert.equal(backlogToleranceMs(5 * MINUTE), 50 * MINUTE);

    // Twenty minutes late, from a dispatcher on a five-minute cadence: sent.
    matrix.sendStatus = 200;
    const user = seedUser();
    const roomId = joinedRoom('slow-cadence', user.username);
    const record = db.createScheduledMessage({
        id: randomUUID(),
        userId: user.id,
        matrixRoomId: roomId,
        body: 'on a slow dispatcher',
        deliverAt: futureIso(-20 * MINUTE),
    });
    await runScheduledMessageDispatch({ overdueToleranceMs: backlogToleranceMs(5 * MINUTE) });
    assert.equal(db.getScheduledMessage(record.id)?.status, 'delivered');
});
