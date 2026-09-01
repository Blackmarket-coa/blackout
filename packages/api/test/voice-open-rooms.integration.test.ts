import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api-test';
process.env.JWT_AUDIENCE = 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
process.env.BLACKOUT_DB_MODE = 'memory';

const { default: app } = await import('../src/index');
const { signJwt, hashPassword } = await import('../src/services/auth');
const { db } = await import('../src/db/store');

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

const bearer = (u: { id: string; username: string }) => ({
    authorization: `Bearer ${signJwt(u.id, u.username, 600)}`,
    'content-type': 'application/json',
});

const openRooms = async (viewer: { id: string; username: string }) => {
    const res = await app.request('/v1/voice/rooms/open', { headers: bearer(viewer) });
    return (
        (await res.json()) as {
            rooms: { roomId: string; participantCount: number }[];
        }
    ).rooms;
};

const makeRoom = (options: { locked?: boolean; active?: boolean } = {}) => {
    const room = db.createOrUpdateVoiceRoom({
        canopyId: randomUUID(),
        channelId: randomUUID(),
        livekitRoomName: `room-${randomUUID().slice(0, 8)}`,
        createdBy: randomUUID(),
    });
    if (options.locked) db.setVoiceRoomLock(room.id, true);
    if (options.active === false) {
        db.canopyVoiceRooms.set(room.id, { ...db.canopyVoiceRooms.get(room.id)!, active: false });
    }
    return db.canopyVoiceRooms.get(room.id)!;
};

test('open rooms lists unlocked, active rooms so a newcomer can drop in', async () => {
    db.canopyVoiceRooms.clear();
    db.voiceRoomParticipants.clear();
    const viewer = seedUser();

    const open = makeRoom();
    const locked = makeRoom({ locked: true });
    const ended = makeRoom({ active: false });

    const rooms = await openRooms(viewer);
    const ids = rooms.map((r) => r.roomId);

    assert.ok(ids.includes(open.id));
    // A locked room's whole point is not being dropped into.
    assert.ok(!ids.includes(locked.id), 'locked rooms are not listed');
    assert.ok(!ids.includes(ended.id), 'ended rooms are not listed');
});

test('participant counts reflect who is actually still in the room', async () => {
    db.canopyVoiceRooms.clear();
    db.voiceRoomParticipants.clear();
    const viewer = seedUser();
    const room = makeRoom();

    const stayer = randomUUID();
    const leaver = randomUUID();
    db.joinVoiceRoom({
        roomId: room.id,
        userId: stayer,
        role: 'member',
        canPublish: true,
        canSubscribe: true,
    });
    db.joinVoiceRoom({
        roomId: room.id,
        userId: leaver,
        role: 'member',
        canPublish: true,
        canSubscribe: true,
    });
    db.leaveVoiceRoom(room.id, leaver);

    const rooms = await openRooms(viewer);
    assert.equal(rooms.find((r) => r.roomId === room.id)?.participantCount, 1);
});

test('busier rooms come first — the empty one is the hardest to walk into', async () => {
    db.canopyVoiceRooms.clear();
    db.voiceRoomParticipants.clear();
    const viewer = seedUser();

    const quiet = makeRoom();
    const busy = makeRoom();
    for (let i = 0; i < 3; i += 1) {
        db.joinVoiceRoom({
            roomId: busy.id,
            userId: randomUUID(),
            role: 'member',
            canPublish: true,
            canSubscribe: true,
        });
    }

    const rooms = await openRooms(viewer);
    assert.equal(rooms[0]?.roomId, busy.id);
    // Nothing is hidden — the quiet room is still listed, just after.
    assert.ok(rooms.some((r) => r.roomId === quiet.id));
});

test('drop-in discovery requires a signed-in viewer', async () => {
    const res = await app.request('/v1/voice/rooms/open');
    assert.equal(res.status, 401);
});
