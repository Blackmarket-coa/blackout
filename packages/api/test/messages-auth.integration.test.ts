/**
 * The legacy channel message endpoint, `/v1/messages/:channelId`.
 *
 * POST used to need no session and took the author from the body, so anyone
 * could store a message as any user and, by naming a room, make the bot post it
 * there under that user's name (and fan it out to bridged Twitch/YouTube
 * chats). GET needed no session either and returned any channel's messages,
 * including DM-shaped channels whose id names both participants.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';
import { createMatrixStub, encryptionEvent, memberEvent } from './_fixtures/matrixStub';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api-test';
process.env.JWT_AUDIENCE = 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.MATRIX_HOMESERVER = 'https://matrix.test.local';
process.env.MATRIX_BOT_TOKEN = 'syt_test_admin_token';
process.env.MATRIX_HOMESERVER_DOMAIN = 'test.local';

const matrix = createMatrixStub({ domain: 'test.local' });
globalThis.fetch = matrix.fetch;

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');

const seedUser = () => {
    const id = randomUUID();
    const username = `msg-${id.slice(0, 8)}`;
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
});

const post = (channelId: string, body: Record<string, unknown>, headers: Record<string, string>) =>
    app.request(`/v1/messages/${channelId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });

const list = async (channelId: string, headers: Record<string, string>) =>
    app.request(`/v1/messages/${channelId}`, { headers });

const storedIn = (channelId: string) =>
    [...db.messages.values()].filter((m) => m.channelId === channelId);

test('POST without a session is refused and stores and sends nothing (M1)', async () => {
    const victim = seedUser();
    const channelId = `chan-${randomUUID().slice(0, 8)}`;
    const roomId = `!m1-${randomUUID().slice(0, 8)}:test.local`;
    matrix.rooms.set(roomId, [
        memberEvent(matrix.mxid(victim.username)),
        memberEvent(matrix.botUserId),
    ]);
    matrix.clearCalls();

    const res = await post(
        channelId,
        { content: 'posted as someone else', userId: victim.id, matrixRoomId: roomId },
        {}
    );
    assert.equal(res.status, 401);
    assert.equal(storedIn(channelId).length, 0, 'nothing stored');
    assert.equal(matrix.sends.length, 0, 'no bot post');

    const reader = seedUser();
    const after = await list(channelId, auth(reader));
    assert.deepEqual(await after.json(), [], 'the channel is unchanged');
});

test('POST naming another author is refused (M2)', async () => {
    const a = seedUser();
    const b = seedUser();
    const channelId = `chan-${randomUUID().slice(0, 8)}`;
    const res = await post(channelId, { content: 'I am B', userId: b.id }, auth(a));
    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as { code: string }).code, 'user_mismatch');
    assert.equal(storedIn(channelId).length, 0);
});

test('POST stores under the session user, with or without a matching body userId', async () => {
    const a = seedUser();
    const channelId = `chan-${randomUUID().slice(0, 8)}`;
    const withId = await post(channelId, { content: 'legacy client', userId: a.id }, auth(a));
    assert.equal(withId.status, 201);
    const withoutId = await post(channelId, { content: 'new client' }, auth(a));
    assert.equal(withoutId.status, 201);
    const rows = storedIn(channelId);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((m) => m.userId === a.id));
});

test('POST naming a room the caller is not in is refused before anything is stored (M3)', async () => {
    const a = seedUser();
    const channelId = `chan-${randomUUID().slice(0, 8)}`;
    const roomId = `!m3-${randomUUID().slice(0, 8)}:test.local`;
    matrix.rooms.set(roomId, [memberEvent(matrix.botUserId)]);
    matrix.clearCalls();

    const res = await post(
        channelId,
        { content: 'into a room I am not in', matrixRoomId: roomId },
        auth(a)
    );
    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as { code: string }).code, 'not_room_member');
    assert.equal(storedIn(channelId).length, 0);
    assert.equal(matrix.sends.length, 0, 'no bot post');
});

test('POST naming an encrypted room is refused', async () => {
    const a = seedUser();
    const roomId = `!enc-${randomUUID().slice(0, 8)}:test.local`;
    matrix.rooms.set(roomId, [
        memberEvent(matrix.mxid(a.username)),
        memberEvent(matrix.botUserId),
        encryptionEvent(),
    ]);
    matrix.clearCalls();
    const res = await post(
        'general',
        { content: 'plaintext into e2ee', matrixRoomId: roomId },
        auth(a)
    );
    assert.equal(res.status, 409);
    assert.equal(((await res.json()) as { code: string }).code, 'room_encrypted');
    assert.equal(matrix.sends.length, 0);
});

test('POST naming a joined, unencrypted room posts once, under the caller name (M4)', async () => {
    const a = seedUser();
    const roomId = `!m4-${randomUUID().slice(0, 8)}:test.local`;
    matrix.rooms.set(roomId, [memberEvent(matrix.mxid(a.username)), memberEvent(matrix.botUserId)]);
    matrix.clearCalls();
    const res = await post('general', { content: 'hello room', matrixRoomId: roomId }, auth(a));
    assert.equal(res.status, 201);
    const sends = matrix.sendsTo(roomId);
    assert.equal(sends.length, 1);
    assert.ok(sends[0].raw.includes(a.username));
    assert.ok(sends[0].raw.includes('hello room'));
});

test('GET without a session is refused', async () => {
    const res = await app.request('/v1/messages/general');
    assert.equal(res.status, 401);
});

test('a DM-shaped channel is readable by its two participants only', async () => {
    const a = seedUser();
    const b = seedUser();
    const stranger = seedUser();
    const dm = `dm-${a.id}-${b.id}`;
    assert.equal((await post(dm, { content: 'hi b' }, auth(a))).status, 201);
    assert.equal((await post(dm, { content: 'hi a' }, auth(b))).status, 201);

    for (const participant of [a, b]) {
        const res = await list(dm, auth(participant));
        assert.equal(res.status, 200);
        const rows = (await res.json()) as Array<{ userId: string; content: string }>;
        assert.ok(rows.some((m) => m.userId === a.id));
        assert.ok(rows.some((m) => m.userId === b.id));
    }

    const denied = await list(dm, auth(stranger));
    assert.equal(denied.status, 403);
    const deniedBody = (await denied.json()) as Record<string, unknown>;
    assert.equal(deniedBody.code, 'not_channel_member');
    assert.ok(!JSON.stringify(deniedBody).includes('hi b'), 'no message text in the refusal');

    // Same participants, different letter case: still only the two of them.
    const upper = await list(`dm-${a.id.toUpperCase()}-${b.id.toUpperCase()}`, auth(stranger));
    assert.equal(upper.status, 403);
});

test('any other channel id is readable by any signed-in account (no membership is recorded)', async () => {
    const a = seedUser();
    const other = seedUser();
    const channelId = `room-${randomUUID().slice(0, 8)}`;
    assert.equal((await post(channelId, { content: 'open channel' }, auth(a))).status, 201);
    const res = await list(channelId, auth(other));
    assert.equal(res.status, 200);
    const rows = (await res.json()) as Array<{ content: string }>;
    assert.ok(rows.some((m) => m.content === 'open channel'));
});
