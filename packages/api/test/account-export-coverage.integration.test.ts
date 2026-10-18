/**
 * Both data exports (`GET /v1/auth/account/export` and `GET /v1/data-export`,
 * which reuses the first as `account`) must list the user's scheduled messages,
 * which the API holds as plaintext until they are sent, and the dead-man
 * switches the user owns. Before 2026-10-12 neither did, while the export
 * manifest told users all their messages were end-to-end encrypted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';
import { createMatrixStub, memberEvent } from './_fixtures/matrixStub';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api-test';
process.env.JWT_AUDIENCE = 'blackout-client-test';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.EXPORT_RATE_LIMIT_MAX = '500';
process.env.MATRIX_HOMESERVER = 'https://matrix.test.local';
process.env.MATRIX_BOT_TOKEN = 'syt_test_admin_token';
process.env.MATRIX_HOMESERVER_DOMAIN = 'test.local';
delete process.env.FBM_ENTITLEMENTS_BASE_URL;

const matrix = createMatrixStub({ domain: 'test.local' });
globalThis.fetch = matrix.fetch;

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');

const seedUser = () => {
    const id = randomUUID();
    const username = `exp-${id.slice(0, 8)}`;
    db.createUser({
        id,
        username,
        email: `${username}@example.com`,
        passwordHash: 'unused',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: 'pk',
    });
    return db.getUserById(id)!;
};

const auth = (user: { id: string; username: string }) => ({
    authorization: `Bearer ${signJwt(user.id, user.username, 600)}`,
    'content-type': 'application/json',
});

const scheduleInJoinedRoom = async (user: { id: string; username: string }, body: string) => {
    const roomId = `!exp-${randomUUID().slice(0, 8)}:test.local`;
    matrix.rooms.set(roomId, [
        memberEvent(matrix.mxid(user.username)),
        memberEvent(matrix.botUserId),
    ]);
    const res = await app.request('/v1/scheduled-messages', {
        method: 'POST',
        headers: auth(user),
        body: JSON.stringify({
            matrixRoomId: roomId,
            body,
            deliverAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
    });
    assert.equal(res.status, 201);
    const { scheduledMessage } = (await res.json()) as { scheduledMessage: { id: string } };
    return { id: scheduledMessage.id, roomId };
};

const armSwitch = (ownerId: string, recipients: string[]) =>
    db.createDeadmanSwitch({
        id: randomUUID(),
        ownerId,
        roomId: '!switch-room:test.local',
        status: 'armed',
        checkInIntervalSeconds: 3600,
        gracePeriodSeconds: 600,
        lastCheckInAt: new Date().toISOString(),
        triggerAt: new Date(Date.now() + 3600_000).toISOString(),
        releaseAt: new Date(Date.now() + 4200_000).toISOString(),
        recipients,
        encryptedPayload: 'sealed-payload',
        headline: 'Backup release',
    });

type ScheduledExport = Array<{ id: string; body: string; matrixRoomId: string; status: string }>;
type SwitchExport = Array<{ id: string; recipientCount: number; roomId: string }>;

test('the account export lists the caller’s scheduled messages, with their text (X-1)', async () => {
    const user = seedUser();
    const other = seedUser();
    const mine = await scheduleInJoinedRoom(user, 'see you at noon');
    const theirs = await scheduleInJoinedRoom(other, 'not yours');
    const done = await scheduleInJoinedRoom(user, 'changed my mind');
    assert.ok(db.cancelScheduledMessage(done.id, user.id), 'the message was cancelled');

    const res = await app.request('/v1/auth/account/export', { headers: auth(user) });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { scheduledMessages: ScheduledExport };
    const entry = body.scheduledMessages.find((m) => m.id === mine.id);
    assert.ok(entry, 'the scheduled message is exported');
    assert.equal(entry?.body, 'see you at noon');
    assert.equal(entry?.matrixRoomId, mine.roomId);
    assert.equal(entry?.status, 'pending');
    assert.ok(!body.scheduledMessages.some((m) => m.id === theirs.id), "no one else's messages");

    // Finished messages are listed too, with their status and no text.
    const cancelled = body.scheduledMessages.find((m) => m.id === done.id);
    assert.ok(cancelled, 'a cancelled message is exported, not only pending ones');
    assert.equal(cancelled?.status, 'cancelled');
    assert.equal(cancelled?.body, '', 'a cancelled message keeps no text');
});

test('the self-service export carries them under account and no longer claims all messages are E2EE (X-2)', async () => {
    const user = seedUser();
    const scheduled = await scheduleInJoinedRoom(user, 'portable text');

    const res = await app.request('/v1/data-export', { headers: auth(user) });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
        account: { scheduledMessages: ScheduledExport };
        manifest: { matrixHistory: { reason: string } };
    };
    assert.ok(body.account.scheduledMessages.some((m) => m.id === scheduled.id));
    const reason = body.manifest.matrixHistory.reason;
    assert.ok(!reason.includes('Your messages are end-to-end encrypted'), reason);
    assert.match(reason, /not encrypted/i, 'says unencrypted rooms are readable on the server');
    assert.match(reason, /account\.scheduledMessages/, 'points at the scheduled messages');
});

test('both exports list the dead-man switches the caller owns, counting recipients (X-3)', async () => {
    const owner = seedUser();
    const recipient = seedUser();
    const owned = armSwitch(owner.id, [recipient.id, '@witness:test.local']);
    const notOwned = armSwitch(recipient.id, [owner.id]);

    const account = await app.request('/v1/auth/account/export', { headers: auth(owner) });
    assert.equal(account.status, 200);
    const accountBody = (await account.json()) as { deadmanSwitches: SwitchExport };
    const entry = accountBody.deadmanSwitches.find((s) => s.id === owned.id);
    assert.ok(entry, 'the owned switch is exported');
    assert.equal(entry?.recipientCount, 2);
    assert.equal(entry?.roomId, '!switch-room:test.local');
    assert.ok(
        !JSON.stringify(accountBody.deadmanSwitches).includes(recipient.id),
        'recipients are counted, not listed'
    );
    assert.ok(
        !accountBody.deadmanSwitches.some((s) => s.id === notOwned.id),
        'a switch the caller is only a recipient of is not theirs to export'
    );

    const full = await app.request('/v1/data-export', { headers: auth(owner) });
    const fullBody = (await full.json()) as { account: { deadmanSwitches: SwitchExport } };
    assert.ok(fullBody.account.deadmanSwitches.some((s) => s.id === owned.id));
});
