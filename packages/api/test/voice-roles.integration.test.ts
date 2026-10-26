/**
 * Voice-room roles (`src/routes/voice.ts`, `src/services/voiceRoleGate.ts`).
 *
 * The role that decides who may create a voice room in a canopy, moderate one
 * and enter one that is locked comes from the canopy's power levels on the
 * homeserver, never from the request: `admin` at the level needed to change
 * `m.room.power_levels`, `moderator` at the `kick` level, `member` for anyone
 * else, and no elevated role when the homeserver cannot say. The homeserver is
 * a stub (`_fixtures/matrixStub.ts`) answering the Synapse admin room-state
 * read the check makes; the tests that expect the check to run assert that the
 * read reached it. LiveKit's room service, which mute and remove act through,
 * is a fake (`_fixtures/livekitStub.ts`) that records the calls.
 * Record: O4 and V1 to V7 in `docs/security/capability-header-triage-2026-10-23.md`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
    createMatrixStub,
    joinRulesEvent,
    memberEvent,
    powerLevelsEvent,
    type StubStateEvent,
} from './_fixtures/matrixStub';
import { createLiveKitStub } from './_fixtures/livekitStub';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api-test';
process.env.JWT_AUDIENCE = 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = '10000';
process.env.BLACKOUT_DB_MODE = 'memory';
process.env.LIVEKIT_URL = 'wss://livekit.local';
process.env.LIVEKIT_API_KEY = 'lk_test_key';
process.env.LIVEKIT_API_SECRET = 'lk_test_secret';
process.env.MATRIX_HOMESERVER = 'https://matrix.test.local';
process.env.MATRIX_BOT_TOKEN = 'syt_test_admin_token';
process.env.MATRIX_HOMESERVER_DOMAIN = 'test.local';

const matrix = createMatrixStub({ domain: 'test.local' });
globalThis.fetch = matrix.fetch;

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { upsertCanopy } = await import('../src/services/canopyDirectory');
const { applySubscriptionWebhookEvent } = await import('../src/services/subscriptions');
const { setRoomServiceClientFactory } = await import('../src/services/livekitAdmin');
const { LIVEKIT_TOKEN_TTL_SECONDS } = await import('../src/services/livekit');

const livekit = createLiveKitStub();
setRoomServiceClientFactory(() => livekit.client);

type Caller = { id: string; username: string; mxid: string };

let entitlementSeed = 0;
/** The premium canopy subscription voice joins and room creation require. */
const entitle = (userId: string) =>
    applySubscriptionWebhookEvent({
        eventId: `evt_voice_roles_${userId}_${++entitlementSeed}`,
        type: 'invoice.paid',
        userId,
        planCode: 'canopy_sprout_monthly',
    });

const seedUser = (): Caller => {
    const id = randomUUID();
    const username = `voice-${id.slice(0, 8)}`;
    db.createUser({
        id,
        username,
        email: `${username}@example.com`,
        passwordHash: 'unused',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: 'pk',
    });
    entitle(id);
    return { id, username, mxid: matrix.mxid(username) };
};

const createEvent = (): StubStateEvent => ({
    type: 'm.room.create',
    state_key: '',
    content: { type: 'm.space' },
});

/** The power levels the fork gives a new room, with the New canopy form's `events_default`. */
const canopyPowerLevels = (users: Record<string, unknown>) =>
    powerLevelsEvent({
        users,
        users_default: 0,
        events: { 'm.room.power_levels': 100, 'm.room.name': 50 },
        events_default: 50,
        state_default: 50,
        ban: 50,
        kick: 50,
        redact: 50,
        invite: 50,
    });

const newCanopyId = () => `!canopy-${randomUUID().slice(0, 8)}:${matrix.domain}`;
const newChannelId = () => `ch-${randomUUID().slice(0, 8)}`;

/**
 * A listed canopy whose creator is at 100, a moderator at 50 and a member at 0,
 * all joined; public, as the New canopy form makes a listed canopy, unless
 * `joinRule` says otherwise (`null`: no join-rules event at all).
 */
const seedCanopy = (options: { joinRule?: string | null } = {}) => {
    const admin = seedUser();
    const moderator = seedUser();
    const member = seedUser();
    const canopyId = newCanopyId();
    const joinRule = options.joinRule === undefined ? 'public' : options.joinRule;
    matrix.rooms.set(canopyId, [
        createEvent(),
        ...(joinRule === null ? [] : [joinRulesEvent(joinRule)]),
        memberEvent(admin.mxid),
        memberEvent(moderator.mxid),
        memberEvent(member.mxid),
        canopyPowerLevels({ [admin.mxid]: 100, [moderator.mxid]: 50 }),
    ]);
    upsertCanopy({ canopyId, name: 'Voice roles canopy' });
    return { canopyId, admin, moderator, member };
};

/** A voice room as `/rooms/create` leaves it, for the tests about who may join one. */
const seedRoom = (canopyId: string, options: { locked?: boolean } = {}) => {
    const channelId = newChannelId();
    const room = db.createOrUpdateVoiceRoom({
        canopyId,
        channelId,
        createdBy: 'seed',
        livekitRoomName: `canopy-${canopyId}-channel-${channelId}`,
    });
    if (options.locked) db.setVoiceRoomLock(room.id, true);
    return { channelId, roomId: room.id };
};

// Each caller is its own client, so the global per-address rate limit (120
// requests a minute) counts each one separately, as it would in production.
const addresses = new Map<string, string>();
const addressOf = (userId: string): string => {
    let address = addresses.get(userId);
    if (!address) {
        address = `2001:db8::${(addresses.size + 1).toString(16)}`;
        addresses.set(userId, address);
    }
    return address;
};

const post = (path: string, caller: { id: string; username: string }, body: object) =>
    app.request(`/v1/voice${path}`, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${signJwt(caller.id, caller.username, 600)}`,
            'content-type': 'application/json',
            'x-forwarded-for': addressOf(caller.id),
        },
        body: JSON.stringify(body),
    });

const refusal = async (res: Response) => ({
    status: res.status,
    code: ((await res.json()) as { code?: string }).code,
});

/** What a LiveKit token grants: the role in its `metadata` claim, the video grant, and its lifetime. */
const tokenClaims = (token: string) => {
    const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as {
        metadata: string;
        video: { canPublish: boolean; canSubscribe: boolean; room: string };
        iat: number;
        exp: number;
    };
    return {
        role: (JSON.parse(payload.metadata) as { role: string }).role,
        canPublish: payload.video.canPublish,
        canSubscribe: payload.video.canSubscribe,
        room: payload.video.room,
        ttlSeconds: payload.exp - payload.iat,
    };
};
const tokenRole = (token: string): string => tokenClaims(token).role;

/** Join, expect it to succeed, and return the permissions (the token carries the same role). */
const joinAs = async (caller: Caller, canopyId: string, channelId: string, extra: object = {}) => {
    const res = await post('/rooms/join', caller, { canopyId, channelId, ...extra });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
        permissions: { role: string; canPublish: boolean; canSubscribe: boolean };
        livekit: { token: string };
    };
    assert.equal(tokenRole(body.livekit.token), body.permissions.role);
    return body.permissions;
};

const tokenAs = async (caller: Caller, canopyId: string, channelId: string, extra: object = {}) => {
    const res = await post('/token', caller, { canopyId, channelId, ...extra });
    assert.equal(res.status, 200);
    return tokenRole(((await res.json()) as { token: string }).token);
};

/** Get a token, expect it, and return what it grants. */
const tokenGrantsAs = async (
    caller: Caller,
    canopyId: string,
    channelId: string,
    extra: object = {}
) => {
    const res = await post('/token', caller, { canopyId, channelId, ...extra });
    assert.equal(res.status, 200);
    return tokenClaims(((await res.json()) as { token: string }).token);
};

const livekitRoomName = (canopyId: string, channelId: string) =>
    `canopy-${canopyId}-channel-${channelId}`;
const activeSanctions = (roomId: string) =>
    db.listActiveVoiceRoomSanctions(roomId).map((s) => [s.kind, s.userId, s.actorId]);

const isLocked = (canopyId: string, channelId: string) =>
    db.getVoiceRoom(canopyId, channelId)?.isLocked;
const activeIds = (roomId: string) =>
    db.getVoiceRoomActiveParticipants(roomId).map((p) => p.userId);
const moderationLog = (roomId: string) =>
    db
        .listVoiceRoomEvents(roomId)
        .filter((e) => e.eventType !== 'join' && e.eventType !== 'leave')
        .map((e) => [e.eventType, e.actorId, e.metadata?.role]);

test('V-1: the canopy admin and a moderator create voice rooms; the API asked the homeserver', async () => {
    const { canopyId, admin, moderator } = seedCanopy();
    for (const caller of [admin, moderator]) {
        const channelId = newChannelId();
        matrix.clearCalls();
        const res = await post('/rooms/create', caller, { canopyId, channelId });
        assert.equal(res.status, 201);
        assert.deepEqual(matrix.stateReads, [canopyId]);
        assert.equal(db.getVoiceRoom(canopyId, channelId)?.createdBy, caller.id);
    }
});

test('V-2: joining, each caller gets the role the canopy gives them', async () => {
    const { canopyId, admin, moderator, member } = seedCanopy();
    const { channelId, roomId } = seedRoom(canopyId);
    const asked = { canPublish: false, canSubscribe: false };

    matrix.clearCalls();
    assert.deepEqual(await joinAs(admin, canopyId, channelId, asked), {
        role: 'admin',
        canPublish: true,
        canSubscribe: true,
    });
    assert.deepEqual(matrix.stateReads, [canopyId]);
    assert.deepEqual(await joinAs(moderator, canopyId, channelId, asked), {
        role: 'moderator',
        canPublish: true,
        canSubscribe: true,
    });
    // An ordinary member joins an unlocked room as before, and keeps what they asked for.
    assert.deepEqual(await joinAs(member, canopyId, channelId, asked), {
        role: 'member',
        canPublish: false,
        canSubscribe: false,
    });

    const roles = Object.fromEntries(
        db.getVoiceRoomActiveParticipants(roomId).map((p) => [p.userId, p.role])
    );
    assert.deepEqual(roles, {
        [admin.id]: 'admin',
        [moderator.id]: 'moderator',
        [member.id]: 'member',
    });
});

test('V-3: a member cannot create, moderate or enter a locked room; a moderator and the admin can', async () => {
    const { canopyId, admin, moderator, member } = seedCanopy();
    const { channelId, roomId } = seedRoom(canopyId);
    await joinAs(member, canopyId, channelId);
    const target = { canopyId, channelId, targetUserId: member.id };

    const otherChannel = newChannelId();
    assert.deepEqual(
        await refusal(await post('/rooms/create', member, { canopyId, channelId: otherChannel })),
        { status: 403, code: 'not_canopy_moderator' }
    );
    assert.equal(db.getVoiceRoom(canopyId, otherChannel), undefined);
    for (const action of ['lock', 'mute', 'remove', 'readmit']) {
        assert.deepEqual(
            await refusal(await post(`/rooms/moderation/${action}`, member, target)),
            { status: 403, code: 'not_canopy_moderator' },
            action
        );
    }
    assert.equal(isLocked(canopyId, channelId), false);
    assert.deepEqual(moderationLog(roomId), []);
    assert.deepEqual(activeIds(roomId), [member.id]);

    assert.equal((await post('/rooms/moderation/mute', moderator, target)).status, 200);
    assert.equal((await post('/rooms/moderation/remove', moderator, target)).status, 200);
    assert.deepEqual(activeIds(roomId), []);
    // Removed: no join and no token for this room until readmitted (V-13).
    for (const path of ['/rooms/join', '/token']) {
        assert.deepEqual(
            await refusal(await post(path, member, { canopyId, channelId })),
            { status: 403, code: 'removed_from_room' },
            path
        );
    }
    assert.equal((await post('/rooms/moderation/readmit', moderator, target)).status, 200);
    assert.equal(
        (await post('/rooms/moderation/lock', moderator, { canopyId, channelId })).status,
        200
    );
    assert.equal(isLocked(canopyId, channelId), true);
    assert.deepEqual(moderationLog(roomId), [
        ['mute', moderator.id, 'moderator'],
        ['remove', moderator.id, 'moderator'],
        ['readmit', moderator.id, 'moderator'],
        ['lock', moderator.id, 'moderator'],
    ]);

    // The locked room refuses the member, for a join and for a token.
    assert.deepEqual(await refusal(await post('/rooms/join', member, { canopyId, channelId })), {
        status: 423,
        code: 'room_locked',
    });
    assert.deepEqual(await refusal(await post('/token', member, { canopyId, channelId })), {
        status: 423,
        code: 'room_locked',
    });
    assert.deepEqual(activeIds(roomId), []);

    assert.equal((await joinAs(moderator, canopyId, channelId)).role, 'moderator');
    assert.equal(await tokenAs(admin, canopyId, channelId), 'admin');
    assert.equal(
        (await post('/rooms/moderation/lock', admin, { canopyId, channelId, locked: false }))
            .status,
        200
    );
    assert.equal(isLocked(canopyId, channelId), false);
});

test('V-4: a caller who is not joined to the canopy gets no role, whatever their level; a banned one is kept out', async () => {
    const { canopyId, admin } = seedCanopy();
    const stranger = seedUser();
    const departed = seedUser();
    const invited = seedUser();
    const banned = seedUser();
    matrix.rooms.set(canopyId, [
        createEvent(),
        joinRulesEvent('public'),
        memberEvent(admin.mxid),
        memberEvent(departed.mxid, 'leave'),
        memberEvent(invited.mxid, 'invite'),
        memberEvent(banned.mxid, 'ban'),
        // Each of the three kept a level of 100.
        canopyPowerLevels({
            [admin.mxid]: 100,
            [departed.mxid]: 100,
            [invited.mxid]: 100,
            [banned.mxid]: 100,
        }),
    ]);
    const open = seedRoom(canopyId);
    const locked = seedRoom(canopyId, { locked: true });
    const otherChannel = newChannelId();

    for (const [label, caller] of Object.entries({ stranger, departed, invited, banned })) {
        matrix.clearCalls();
        assert.deepEqual(
            await refusal(
                await post('/rooms/create', caller, { canopyId, channelId: otherChannel })
            ),
            { status: 403, code: 'not_canopy_moderator' },
            label
        );
        assert.deepEqual(matrix.stateReads, [canopyId], label);
        assert.deepEqual(
            await refusal(
                await post('/rooms/moderation/lock', caller, {
                    canopyId,
                    channelId: open.channelId,
                })
            ),
            { status: 403, code: 'not_canopy_moderator' },
            label
        );
    }
    // The canopy is public, so a stranger, someone who left and someone invited
    // drop into the unlocked room as members (`/rooms/open` lists it to every
    // signed-in account), and the locked room refuses them as members.
    for (const [label, caller] of Object.entries({ stranger, departed, invited })) {
        assert.deepEqual(
            await refusal(
                await post('/rooms/join', caller, { canopyId, channelId: locked.channelId })
            ),
            { status: 423, code: 'room_locked' },
            label
        );
        assert.equal((await joinAs(caller, canopyId, open.channelId)).role, 'member', label);
    }
    // An account the canopy banned is refused by both rooms, for a join and for
    // a token, before the lock is looked at: its level counts for nothing.
    for (const path of ['/rooms/join', '/token']) {
        for (const room of [open, locked]) {
            assert.deepEqual(
                await refusal(await post(path, banned, { canopyId, channelId: room.channelId })),
                { status: 403, code: 'canopy_banned' },
                path
            );
        }
    }
    assert.equal(db.getVoiceRoom(canopyId, otherChannel), undefined);
    assert.equal(isLocked(canopyId, open.channelId), false);
    assert.deepEqual(activeIds(locked.roomId), []);
    assert.deepEqual(activeIds(open.roomId).sort(), [stranger.id, departed.id, invited.id].sort());
});

test('V-5: a role named in the request grants nothing, and is not refused', async () => {
    const { canopyId, admin, member } = seedCanopy();
    const stranger = seedUser();
    const open = seedRoom(canopyId);
    const locked = seedRoom(canopyId, { locked: true });
    const otherChannel = newChannelId();

    for (const [who, caller] of Object.entries({ member, stranger })) {
        for (const claimed of ['admin', 'moderator']) {
            const label = `${who} claiming ${claimed}`;
            const claim = { role: claimed };
            assert.deepEqual(
                await refusal(
                    await post('/rooms/create', caller, {
                        canopyId,
                        channelId: otherChannel,
                        ...claim,
                    })
                ),
                { status: 403, code: 'not_canopy_moderator' },
                label
            );
            for (const action of ['lock', 'mute', 'remove', 'readmit']) {
                assert.deepEqual(
                    await refusal(
                        await post(`/rooms/moderation/${action}`, caller, {
                            canopyId,
                            channelId: open.channelId,
                            targetUserId: admin.id,
                            ...claim,
                        })
                    ),
                    { status: 403, code: 'not_canopy_moderator' },
                    `${label}: ${action}`
                );
            }
            for (const path of ['/rooms/join', '/token']) {
                assert.deepEqual(
                    await refusal(
                        await post(path, caller, {
                            canopyId,
                            channelId: locked.channelId,
                            ...claim,
                        })
                    ),
                    { status: 423, code: 'room_locked' },
                    `${label}: ${path}`
                );
            }
            assert.deepEqual(
                await joinAs(caller, canopyId, open.channelId, { ...claim, canPublish: false }),
                { role: 'member', canPublish: false, canSubscribe: true },
                label
            );
            assert.equal(await tokenAs(caller, canopyId, open.channelId, claim), 'member', label);
        }
    }
    assert.equal(db.getVoiceRoom(canopyId, otherChannel), undefined);
    assert.equal(isLocked(canopyId, open.channelId), false);
    assert.deepEqual(moderationLog(open.roomId), []);
    assert.deepEqual(activeIds(locked.roomId), []);
    // Nor does a lower claim change the admin's role.
    assert.equal((await joinAs(admin, canopyId, open.channelId, { role: 'member' })).role, 'admin');
});

test("V-6: a moderator reaches the canopy's kick level, an admin its power-levels level", async () => {
    const PL = 'm.room.power_levels';
    const cases: Array<{
        label: string;
        role: string;
        levels: (self: string) => Record<string, unknown>;
    }> = [
        {
            label: 'no kick entry: 50 reaches the default 50',
            role: 'moderator',
            levels: (self) => ({ users: { [self]: 50 }, events: { [PL]: 100 } }),
        },
        {
            label: 'no kick entry: 49 is short',
            role: 'member',
            levels: (self) => ({ users: { [self]: 49 }, events: { [PL]: 100 } }),
        },
        {
            label: 'kick 75: 74 is short',
            role: 'member',
            levels: (self) => ({ users: { [self]: 74 }, kick: 75, events: { [PL]: 100 } }),
        },
        {
            label: 'kick 75: 75 reaches it',
            role: 'moderator',
            levels: (self) => ({ users: { [self]: 75 }, kick: 75, events: { [PL]: 100 } }),
        },
        {
            label: 'kick 0: everyone at users_default 0 is a moderator',
            role: 'moderator',
            levels: () => ({ users_default: 0, kick: 0, events: { [PL]: 100 } }),
        },
        {
            label: 'ban and state_default do not raise the bar',
            role: 'moderator',
            levels: (self) => ({
                users: { [self]: 50 },
                kick: 50,
                ban: 100,
                state_default: 100,
                events: { [PL]: 100 },
            }),
        },
        {
            label: 'nor lower it',
            role: 'member',
            levels: (self) => ({
                users: { [self]: 50 },
                kick: 100,
                ban: 0,
                redact: 0,
                state_default: 0,
                events: { [PL]: 100 },
            }),
        },
        {
            label: 'users_default 50, no users entry',
            role: 'moderator',
            levels: () => ({ users_default: 50, events: { [PL]: 100 } }),
        },
        {
            label: 'the power-levels level: 100 reaches 100',
            role: 'admin',
            levels: (self) => ({ users: { [self]: 100 }, events: { [PL]: 100 } }),
        },
        {
            label: 'the power-levels level: 99 is short',
            role: 'moderator',
            levels: (self) => ({ users: { [self]: 99 }, events: { [PL]: 100 } }),
        },
        {
            label: 'no power-levels entry: state_default 75 decides',
            role: 'admin',
            levels: (self) => ({ users: { [self]: 75 }, state_default: 75 }),
        },
        {
            label: 'no power-levels entry: 74 is short of state_default 75',
            role: 'moderator',
            levels: (self) => ({ users: { [self]: 74 }, state_default: 75 }),
        },
        {
            label: 'the events entry wins over state_default',
            role: 'moderator',
            levels: (self) => ({ users: { [self]: 75 }, state_default: 50, events: { [PL]: 100 } }),
        },
        {
            label: 'neither entry: both default to 50, and admin comes first',
            role: 'admin',
            levels: (self) => ({ users: { [self]: 50 } }),
        },
        {
            label: 'integer strings (room versions before 10): moderator',
            role: 'moderator',
            levels: (self) => ({ users: { [self]: '50' }, kick: '50', events: { [PL]: '100' } }),
        },
        {
            label: 'integer strings (room versions before 10): admin',
            role: 'admin',
            levels: (self) => ({ users: { [self]: '100' }, events: { [PL]: '100' } }),
        },
    ];

    for (const { label, role, levels } of cases) {
        const caller = seedUser();
        const canopyId = newCanopyId();
        matrix.rooms.set(canopyId, [
            createEvent(),
            memberEvent(caller.mxid),
            powerLevelsEvent(levels(caller.mxid)),
        ]);
        const { channelId } = seedRoom(canopyId);
        assert.equal((await joinAs(caller, canopyId, channelId)).role, role, label);
    }
});

test('V-7: when the homeserver cannot say, nobody gets an elevated role, and an unlocked join still works', async () => {
    const scenarios: Array<{
        label: string;
        status: number;
        code: string;
        arrange: (canopyId: string, admin: Caller) => (() => void) | void;
    }> = [
        {
            label: 'homeserver error',
            status: 503,
            code: 'canopy_check_unavailable',
            arrange: (canopyId) => void matrix.rooms.set(canopyId, 500),
        },
        {
            label: 'homeserver unreachable',
            status: 503,
            code: 'canopy_check_unavailable',
            arrange: () => {
                matrix.onStateRead = () => {
                    throw new Error('homeserver unreachable');
                };
                return () => {
                    matrix.onStateRead = null;
                };
            },
        },
        {
            label: 'no power-levels event',
            status: 503,
            code: 'canopy_check_unavailable',
            arrange: (canopyId, admin) =>
                void matrix.rooms.set(canopyId, [createEvent(), memberEvent(admin.mxid)]),
        },
        {
            label: 'a user level that is not an integer',
            status: 503,
            code: 'canopy_check_unavailable',
            arrange: (canopyId, admin) =>
                void matrix.rooms.set(canopyId, [
                    createEvent(),
                    memberEvent(admin.mxid),
                    powerLevelsEvent({ users: { [admin.mxid]: 'lots' } }),
                ]),
        },
        {
            label: 'a power-levels level that is not an integer',
            status: 503,
            code: 'canopy_check_unavailable',
            arrange: (canopyId, admin) =>
                void matrix.rooms.set(canopyId, [
                    createEvent(),
                    memberEvent(admin.mxid),
                    powerLevelsEvent({
                        users: { [admin.mxid]: 100 },
                        events: { 'm.room.power_levels': 1.5 },
                    }),
                ]),
        },
        {
            label: 'a kick level that is not an integer',
            status: 503,
            code: 'canopy_check_unavailable',
            arrange: (canopyId, admin) =>
                void matrix.rooms.set(canopyId, [
                    createEvent(),
                    memberEvent(admin.mxid),
                    powerLevelsEvent({ users: { [admin.mxid]: 100 }, kick: 'half' }),
                ]),
        },
        {
            label: 'no bot token',
            status: 503,
            code: 'matrix_not_configured',
            arrange: () => {
                const botToken = process.env.MATRIX_BOT_TOKEN;
                delete process.env.MATRIX_BOT_TOKEN;
                return () => {
                    process.env.MATRIX_BOT_TOKEN = botToken;
                };
            },
        },
    ];

    for (const { label, status, code, arrange } of scenarios) {
        // The admin's level is 100 on the homeserver; none of it can be read.
        const { canopyId, admin } = seedCanopy();
        const open = seedRoom(canopyId);
        const locked = seedRoom(canopyId, { locked: true });
        const otherChannel = newChannelId();
        const restore = arrange(canopyId, admin);
        try {
            assert.deepEqual(
                await refusal(
                    await post('/rooms/create', admin, { canopyId, channelId: otherChannel })
                ),
                { status, code },
                `${label}: create`
            );
            assert.deepEqual(
                await refusal(
                    await post('/rooms/moderation/lock', admin, {
                        canopyId,
                        channelId: open.channelId,
                    })
                ),
                { status, code },
                `${label}: lock`
            );
            for (const path of ['/rooms/join', '/token']) {
                assert.deepEqual(
                    await refusal(
                        await post(path, admin, { canopyId, channelId: locked.channelId })
                    ),
                    { status, code },
                    `${label}: ${path} into a locked room`
                );
            }
            assert.deepEqual(
                await joinAs(admin, canopyId, open.channelId, { canPublish: false }),
                { role: 'member', canPublish: false, canSubscribe: true },
                `${label}: join an unlocked room`
            );
        } finally {
            restore?.();
        }
        assert.equal(db.getVoiceRoom(canopyId, otherChannel), undefined, label);
        assert.equal(isLocked(canopyId, open.channelId), false, label);
        assert.deepEqual(activeIds(locked.roomId), [], label);
    }

    // A valid token whose account is gone has no Matrix id to check.
    const ghost = {
        id: randomUUID(),
        username: 'deleted-voice-account',
        mxid: matrix.mxid('deleted-voice-account'),
    };
    entitle(ghost.id);
    const { canopyId } = seedCanopy();
    matrix.rooms.set(canopyId, [
        createEvent(),
        memberEvent(ghost.mxid),
        canopyPowerLevels({ [ghost.mxid]: 100 }),
    ]);
    const open = seedRoom(canopyId);
    const locked = seedRoom(canopyId, { locked: true });
    const refused = { status: 401, code: 'account_unknown' };
    assert.deepEqual(
        await refusal(await post('/rooms/create', ghost, { canopyId, channelId: newChannelId() })),
        refused
    );
    assert.deepEqual(
        await refusal(
            await post('/rooms/moderation/lock', ghost, { canopyId, channelId: open.channelId })
        ),
        refused
    );
    assert.deepEqual(
        await refusal(await post('/rooms/join', ghost, { canopyId, channelId: locked.channelId })),
        refused
    );
    assert.equal((await joinAs(ghost, canopyId, open.channelId)).role, 'member');
    assert.equal(isLocked(canopyId, open.channelId), false);
});

test('V-8: joining does not start a room; creating one takes a listed canopy and a moderator', async () => {
    const { canopyId, admin, member } = seedCanopy();
    for (const caller of [admin, member]) {
        const channelId = newChannelId();
        matrix.clearCalls();
        for (const path of ['/rooms/join', '/token']) {
            assert.deepEqual(
                await refusal(await post(path, caller, { canopyId, channelId })),
                { status: 404, code: 'room_not_found' },
                path
            );
        }
        assert.equal(db.getVoiceRoom(canopyId, channelId), undefined);
        // There was no room, so the homeserver was not asked.
        assert.deepEqual(matrix.stateReads, []);
    }

    // A canopy that is not listed gets no voice room, even from its admin.
    const unlisted = newCanopyId();
    matrix.rooms.set(unlisted, [
        createEvent(),
        memberEvent(admin.mxid),
        canopyPowerLevels({ [admin.mxid]: 100 }),
    ]);
    assert.deepEqual(
        await refusal(
            await post('/rooms/create', admin, { canopyId: unlisted, channelId: 'main' })
        ),
        { status: 404, code: 'unknown_canopy' }
    );
    assert.deepEqual(
        await refusal(await post('/rooms/join', admin, { canopyId: unlisted, channelId: 'main' })),
        { status: 404, code: 'room_not_found' }
    );
    assert.equal(db.getVoiceRoom(unlisted, 'main'), undefined);

    // A listed entry for a room the homeserver does not know (404) gives nobody a role.
    const gone = newCanopyId();
    upsertCanopy({ canopyId: gone, name: 'Gone' });
    assert.deepEqual(
        await refusal(await post('/rooms/create', admin, { canopyId: gone, channelId: 'main' })),
        { status: 403, code: 'not_canopy_moderator' }
    );
    assert.equal(db.getVoiceRoom(gone, 'main'), undefined);
});

test('V-9: a room locked while the homeserver is being asked still refuses a member', async () => {
    const { canopyId, member } = seedCanopy();
    const { channelId, roomId } = seedRoom(canopyId);
    for (const path of ['/rooms/join', '/token']) {
        db.setVoiceRoomLock(roomId, false);
        matrix.onStateRead = () => {
            db.setVoiceRoomLock(roomId, true);
        };
        try {
            assert.deepEqual(
                await refusal(await post(path, member, { canopyId, channelId })),
                { status: 423, code: 'room_locked' },
                path
            );
        } finally {
            matrix.onStateRead = null;
        }
    }
    assert.deepEqual(activeIds(roomId), []);
});

test("V-10: a voice room's event feed needs a signed-in caller", async () => {
    const { canopyId, member } = seedCanopy();
    const { channelId } = seedRoom(canopyId);
    await joinAs(member, canopyId, channelId);
    const path = `/v1/voice/rooms/${encodeURIComponent(canopyId)}/${encodeURIComponent(
        channelId
    )}/events`;

    // It lists who is in the room and the room's join, leave and moderation history.
    assert.deepEqual(await refusal(await app.request(path)), {
        status: 401,
        code: 'unauthorized',
    });

    const signedIn = await app.request(path, {
        headers: {
            authorization: `Bearer ${signJwt(member.id, member.username, 600)}`,
            'x-forwarded-for': addressOf(member.id),
        },
    });
    assert.equal(signedIn.status, 200);
    const body = (await signedIn.json()) as { activeParticipants: Array<{ userId: string }> };
    assert.deepEqual(
        body.activeParticipants.map((p) => p.userId),
        [member.id]
    );
});

test('V-11: an unknown moderation action is refused and records nothing', async () => {
    const { canopyId, moderator, member } = seedCanopy();
    const { channelId, roomId } = seedRoom(canopyId);
    await joinAs(member, canopyId, channelId);

    matrix.clearCalls();
    assert.deepEqual(
        await refusal(
            await post('/rooms/moderation/kick', moderator, {
                canopyId,
                channelId,
                targetUserId: member.id,
            })
        ),
        { status: 404, code: 'unknown_action' }
    );
    // Refused before the homeserver is asked; no "remove" is logged for a removal
    // that never happened, and the member is still in the room.
    assert.deepEqual(matrix.stateReads, []);
    assert.deepEqual(moderationLog(roomId), []);
    assert.deepEqual(activeIds(roomId), [member.id]);
});

test('V-12: a mute mutes the published audio tracks and takes publishing away in LiveKit, and outlasts the connection', async () => {
    const { canopyId, moderator, member } = seedCanopy();
    const { channelId, roomId } = seedRoom(canopyId);
    const roomName = livekitRoomName(canopyId, channelId);
    await joinAs(member, canopyId, channelId);
    // Connected with a microphone, a second audio track (a shared tab's sound) and a camera.
    livekit.connect(roomName, member.id, [
        { sid: 'TR_mic', kind: 'audio' },
        { sid: 'TR_tab', kind: 'audio' },
        { sid: 'TR_cam', kind: 'video' },
    ]);
    const target = { canopyId, channelId, targetUserId: member.id };

    livekit.clearCalls();
    matrix.clearCalls();
    const muted = await post('/rooms/moderation/mute', moderator, target);
    assert.equal(muted.status, 200);
    assert.deepEqual(await muted.json(), {
        ok: true,
        action: 'mute',
        targetUserId: member.id,
        muted: true,
        livekit: { connected: true, mutedTrackSids: ['TR_mic', 'TR_tab'] },
    });
    assert.deepEqual(matrix.stateReads, [canopyId]);
    // Every audio track, by its id; the camera is left alone; then publishing is
    // taken away, with the other grants kept as they were.
    assert.deepEqual(livekit.calls, [
        { method: 'listParticipants', room: roomName },
        {
            method: 'mutePublishedTrack',
            room: roomName,
            identity: member.id,
            trackSid: 'TR_mic',
            muted: true,
        },
        {
            method: 'mutePublishedTrack',
            room: roomName,
            identity: member.id,
            trackSid: 'TR_tab',
            muted: true,
        },
        {
            method: 'updateParticipant',
            room: roomName,
            identity: member.id,
            permission: { canPublish: false, canSubscribe: true, canPublishData: true },
        },
    ]);
    const connected = livekit.participant(roomName, member.id)!;
    assert.deepEqual(
        connected.tracks.map((t) => [t.sid, t.muted]),
        [
            ['TR_mic', true],
            ['TR_tab', true],
            ['TR_cam', false],
        ]
    );
    assert.equal(connected.permission?.canPublish, false);
    assert.deepEqual(activeSanctions(roomId), [['mute', member.id, moderator.id]]);

    // The mute is the room's answer, not the connection's: a new token cannot
    // publish however it is asked for, on a join and on its own.
    assert.deepEqual(await joinAs(member, canopyId, channelId, { canPublish: true }), {
        role: 'member',
        canPublish: false,
        canSubscribe: true,
    });
    assert.equal(
        (await tokenGrantsAs(member, canopyId, channelId, { canPublish: true })).canPublish,
        false
    );

    // Unmute: publishing back first, then the tracks.
    livekit.clearCalls();
    const unmuted = await post('/rooms/moderation/mute', moderator, { ...target, muted: false });
    assert.equal(unmuted.status, 200);
    assert.deepEqual(await unmuted.json(), {
        ok: true,
        action: 'mute',
        targetUserId: member.id,
        muted: false,
        livekit: { connected: true, mutedTrackSids: ['TR_mic', 'TR_tab'] },
    });
    assert.deepEqual(livekit.calls, [
        { method: 'listParticipants', room: roomName },
        {
            method: 'updateParticipant',
            room: roomName,
            identity: member.id,
            permission: { canPublish: true, canSubscribe: true, canPublishData: true },
        },
        {
            method: 'mutePublishedTrack',
            room: roomName,
            identity: member.id,
            trackSid: 'TR_mic',
            muted: false,
        },
        {
            method: 'mutePublishedTrack',
            room: roomName,
            identity: member.id,
            trackSid: 'TR_tab',
            muted: false,
        },
    ]);
    assert.deepEqual(activeSanctions(roomId), []);
    assert.equal((await tokenGrantsAs(member, canopyId, channelId)).canPublish, true);
    assert.deepEqual(moderationLog(roomId), [
        ['mute', moderator.id, 'moderator'],
        ['unmute', moderator.id, 'moderator'],
    ]);

    // Muting someone who is not connected records the mute all the same.
    const absent = seedUser();
    matrix.rooms.set(canopyId, [
        ...(matrix.rooms.get(canopyId) as StubStateEvent[]),
        memberEvent(absent.mxid),
    ]);
    livekit.clearCalls();
    const res = await post('/rooms/moderation/mute', moderator, {
        canopyId,
        channelId,
        targetUserId: absent.id,
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
        ok: true,
        action: 'mute',
        targetUserId: absent.id,
        muted: true,
        livekit: { connected: false },
    });
    assert.deepEqual(livekit.calls, [{ method: 'listParticipants', room: roomName }]);
    assert.equal((await joinAs(absent, canopyId, channelId)).canPublish, false);
});

test('V-13: a removal disconnects the participant in LiveKit and keeps the account out until it is readmitted', async () => {
    const { canopyId, admin, moderator, member } = seedCanopy();
    const { channelId, roomId } = seedRoom(canopyId);
    const roomName = livekitRoomName(canopyId, channelId);
    await joinAs(member, canopyId, channelId);
    livekit.connect(roomName, member.id, [{ sid: 'TR_mic', kind: 'audio' }]);
    const target = { canopyId, channelId, targetUserId: member.id };

    livekit.clearCalls();
    const removed = await post('/rooms/moderation/remove', moderator, target);
    assert.equal(removed.status, 200);
    assert.deepEqual(await removed.json(), {
        ok: true,
        action: 'remove',
        targetUserId: member.id,
        livekit: { disconnected: true },
    });
    assert.deepEqual(livekit.calls, [
        { method: 'removeParticipant', room: roomName, identity: member.id },
    ]);
    assert.equal(livekit.participant(roomName, member.id), undefined);
    assert.deepEqual(activeIds(roomId), []);
    assert.deepEqual(activeSanctions(roomId), [['remove', member.id, moderator.id]]);

    // No new token for this room, and no join, locked or not; everyone else is unaffected.
    for (const path of ['/rooms/join', '/token']) {
        assert.deepEqual(
            await refusal(await post(path, member, { canopyId, channelId })),
            {
                status: 403,
                code: 'removed_from_room',
            },
            path
        );
    }
    assert.equal(
        (await post('/rooms/moderation/lock', moderator, { canopyId, channelId })).status,
        200
    );
    assert.deepEqual(await refusal(await post('/rooms/join', member, { canopyId, channelId })), {
        status: 403,
        code: 'removed_from_room',
    });
    assert.equal(
        (await post('/rooms/moderation/lock', moderator, { canopyId, channelId, locked: false }))
            .status,
        200
    );
    assert.equal((await joinAs(admin, canopyId, channelId)).role, 'admin');
    assert.deepEqual(activeIds(roomId), [admin.id]);

    // Removing again, with nobody to disconnect, keeps the one record.
    livekit.clearCalls();
    const again = await post('/rooms/moderation/remove', moderator, target);
    assert.equal(again.status, 200);
    assert.deepEqual(await again.json(), {
        ok: true,
        action: 'remove',
        targetUserId: member.id,
        livekit: { disconnected: false },
    });
    assert.deepEqual(livekit.calls, [
        { method: 'removeParticipant', room: roomName, identity: member.id },
    ]);
    assert.deepEqual(activeSanctions(roomId), [['remove', member.id, moderator.id]]);

    // Readmitted: the room is open to them again. Readmitting twice changes nothing.
    const readmitted = await post('/rooms/moderation/readmit', moderator, target);
    assert.equal(readmitted.status, 200);
    assert.deepEqual(await readmitted.json(), {
        ok: true,
        action: 'readmit',
        targetUserId: member.id,
        readmitted: true,
    });
    assert.deepEqual(activeSanctions(roomId), []);
    assert.equal((await joinAs(member, canopyId, channelId)).role, 'member');
    const twice = await post('/rooms/moderation/readmit', moderator, target);
    assert.deepEqual(await twice.json(), {
        ok: true,
        action: 'readmit',
        targetUserId: member.id,
        readmitted: false,
    });
    assert.deepEqual(moderationLog(roomId), [
        ['remove', moderator.id, 'moderator'],
        ['lock', moderator.id, 'moderator'],
        ['unlock', moderator.id, 'moderator'],
        ['remove', moderator.id, 'moderator'],
        ['readmit', moderator.id, 'moderator'],
    ]);
    // The record lives in the store's persisted collection, not only in memory.
    assert.equal(db.voiceRoomSanctions.size >= 1, true);
    assert.ok(
        [...db.voiceRoomSanctions.values()].some(
            (s) =>
                s.roomId === roomId &&
                s.kind === 'remove' &&
                s.liftedAt &&
                s.liftedBy === moderator.id
        )
    );
});

test('V-14: without LiveKit, mute and remove do nothing and say so; when LiveKit fails, the record stands and the answer says so', async () => {
    const { canopyId, moderator, member } = seedCanopy();
    const { channelId, roomId } = seedRoom(canopyId);
    const roomName = livekitRoomName(canopyId, channelId);
    await joinAs(member, canopyId, channelId);
    livekit.connect(roomName, member.id, [{ sid: 'TR_mic', kind: 'audio' }]);
    const target = { canopyId, channelId, targetUserId: member.id };

    const url = process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_URL;
    livekit.clearCalls();
    try {
        for (const action of ['mute', 'remove']) {
            assert.deepEqual(
                await refusal(await post(`/rooms/moderation/${action}`, moderator, target)),
                { status: 503, code: 'livekit_not_configured' },
                action
            );
        }
    } finally {
        process.env.LIVEKIT_URL = url;
    }
    // Nothing done, nothing recorded, nobody asked.
    assert.deepEqual(livekit.calls, []);
    assert.deepEqual(activeSanctions(roomId), []);
    assert.deepEqual(moderationLog(roomId), []);
    assert.deepEqual(activeIds(roomId), [member.id]);
    assert.ok(livekit.participant(roomName, member.id));

    // LiveKit is down: the record is written first and stands; the answer is 502 and says so.
    livekit.failure = new Error('connect ECONNREFUSED');
    try {
        const mute = await post('/rooms/moderation/mute', moderator, target);
        assert.equal(mute.status, 502);
        const muteBody = (await mute.json()) as { code: string; message: string };
        assert.equal(muteBody.code, 'livekit_unavailable');
        assert.match(muteBody.message, /mute is recorded/);
        assert.deepEqual(activeSanctions(roomId), [['mute', member.id, moderator.id]]);
        assert.equal((await tokenGrantsAs(member, canopyId, channelId)).canPublish, false);

        const remove = await post('/rooms/moderation/remove', moderator, target);
        assert.equal(remove.status, 502);
        const removeBody = (await remove.json()) as { code: string; message: string };
        assert.equal(removeBody.code, 'livekit_unavailable');
        assert.match(removeBody.message, /removal is recorded/);
        assert.deepEqual(activeSanctions(roomId), [
            ['mute', member.id, moderator.id],
            ['remove', member.id, moderator.id],
        ]);
        assert.deepEqual(activeIds(roomId), []);
    } finally {
        livekit.failure = null;
    }
    // Still connected in LiveKit (nothing reached it), and still kept out once it is back.
    assert.ok(livekit.participant(roomName, member.id));
    assert.deepEqual(await refusal(await post('/rooms/join', member, { canopyId, channelId })), {
        status: 403,
        code: 'removed_from_room',
    });
    assert.deepEqual(moderationLog(roomId), [
        ['mute', moderator.id, 'moderator'],
        ['remove', moderator.id, 'moderator'],
    ]);
    assert.deepEqual(
        db
            .listVoiceRoomEvents(roomId)
            .filter((e) => e.eventType !== 'join')
            .map((e) => e.metadata?.livekit),
        ['livekit_unavailable', 'livekit_unavailable']
    );
    // Retried once LiveKit is back, the removal disconnects them.
    livekit.clearCalls();
    const retried = await post('/rooms/moderation/remove', moderator, target);
    assert.equal(retried.status, 200);
    assert.deepEqual(await retried.json(), {
        ok: true,
        action: 'remove',
        targetUserId: member.id,
        livekit: { disconnected: true },
    });
    assert.equal(livekit.participant(roomName, member.id), undefined);
});

test('V-15: a LiveKit token lives two minutes, and neither the request nor the environment lengthens it', async () => {
    const { canopyId, member } = seedCanopy();
    const { channelId } = seedRoom(canopyId);
    assert.equal(LIVEKIT_TOKEN_TTL_SECONDS, 120);

    const config = (await (await app.request('/v1/voice/config')).json()) as {
        tokenTtlSeconds: number;
    };
    assert.equal(config.tokenTtlSeconds, 120);

    const joined = await post('/rooms/join', member, { canopyId, channelId });
    assert.equal(joined.status, 200);
    const body = (await joined.json()) as { livekit: { token: string; expiresAt: string } };
    assert.equal(tokenClaims(body.livekit.token).ttlSeconds, 120);
    assert.ok(Date.parse(body.livekit.expiresAt) - Date.now() <= 120_000);

    // `ttlSeconds` in the request is dropped like any unknown key, and the old
    // environment setting is not read.
    assert.equal(
        (await tokenGrantsAs(member, canopyId, channelId, { ttlSeconds: 900 })).ttlSeconds,
        120
    );
    process.env.LIVEKIT_TOKEN_TTL_SECONDS = '900';
    try {
        assert.equal((await tokenGrantsAs(member, canopyId, channelId)).ttlSeconds, 120);
    } finally {
        delete process.env.LIVEKIT_TOKEN_TTL_SECONDS;
    }
});

test('V-16: the canopy decides who enters its rooms: never a banned account, and a non-member only where it is public', async () => {
    // Not public (join rule `invite`): its members and the invited get in; nobody else.
    const closed = seedCanopy({ joinRule: 'invite' });
    const stranger = seedUser();
    const departed = seedUser();
    const invited = seedUser();
    const banned = seedUser();
    matrix.rooms.set(closed.canopyId, [
        ...(matrix.rooms.get(closed.canopyId) as StubStateEvent[]).filter(
            (e) => e.type !== 'm.room.power_levels'
        ),
        memberEvent(departed.mxid, 'leave'),
        memberEvent(invited.mxid, 'invite'),
        memberEvent(banned.mxid, 'ban'),
        canopyPowerLevels({
            [closed.admin.mxid]: 100,
            [closed.moderator.mxid]: 50,
            [banned.mxid]: 100,
        }),
    ]);
    const room = seedRoom(closed.canopyId);
    for (const path of ['/rooms/join', '/token']) {
        for (const [label, caller] of Object.entries({ stranger, departed })) {
            matrix.clearCalls();
            assert.deepEqual(
                await refusal(
                    await post(path, caller, {
                        canopyId: closed.canopyId,
                        channelId: room.channelId,
                    })
                ),
                { status: 403, code: 'not_canopy_member' },
                `${label}: ${path}`
            );
            assert.deepEqual(matrix.stateReads, [closed.canopyId], label);
        }
        assert.deepEqual(
            await refusal(
                await post(path, banned, { canopyId: closed.canopyId, channelId: room.channelId })
            ),
            { status: 403, code: 'canopy_banned' },
            path
        );
    }
    assert.equal((await joinAs(invited, closed.canopyId, room.channelId)).role, 'member');
    assert.equal((await joinAs(closed.member, closed.canopyId, room.channelId)).role, 'member');
    assert.equal(await tokenAs(closed.moderator, closed.canopyId, room.channelId), 'moderator');
    assert.deepEqual(activeIds(room.roomId).sort(), [invited.id, closed.member.id].sort());

    // Every rule but `public` keeps a non-member out, and so does a canopy with
    // no join rule to read: the API cannot evaluate an allow list, so it fails
    // closed. `public` lets them in.
    for (const joinRule of ['knock', 'restricted', 'knock_restricted', 'private', null, 'public']) {
        const canopy = seedCanopy({ joinRule });
        const { channelId } = seedRoom(canopy.canopyId);
        const outsider = seedUser();
        const label = `join rule ${joinRule}`;
        if (joinRule === 'public') {
            assert.equal(
                (await joinAs(outsider, canopy.canopyId, channelId)).role,
                'member',
                label
            );
            assert.equal(await tokenAs(outsider, canopy.canopyId, channelId), 'member', label);
        } else {
            for (const path of ['/rooms/join', '/token']) {
                assert.deepEqual(
                    await refusal(
                        await post(path, outsider, { canopyId: canopy.canopyId, channelId })
                    ),
                    { status: 403, code: 'not_canopy_member' },
                    `${label}: ${path}`
                );
            }
        }
        // Its own members are unaffected by the rule.
        assert.equal(
            (await joinAs(canopy.member, canopy.canopyId, channelId)).role,
            'member',
            label
        );
    }

    // A room whose canopy the homeserver does not know admits nobody: there is
    // no canopy to be a member of, and none to join.
    const gone = newCanopyId();
    const orphan = seedRoom(gone);
    for (const path of ['/rooms/join', '/token']) {
        matrix.clearCalls();
        assert.deepEqual(
            await refusal(
                await post(path, stranger, { canopyId: gone, channelId: orphan.channelId })
            ),
            { status: 403, code: 'not_canopy_member' },
            path
        );
        assert.deepEqual(matrix.stateReads, [gone]);
    }
    assert.deepEqual(activeIds(orphan.roomId), []);

    // When the homeserver cannot say, the entry cannot be checked: an unlocked
    // room still admits the account as a member, as before (recorded in
    // KNOWN_LIMITATIONS.md); a locked one answers with the reason (V-7).
    const down = seedCanopy();
    const downRoom = seedRoom(down.canopyId);
    matrix.rooms.set(down.canopyId, 500);
    assert.equal((await joinAs(stranger, down.canopyId, downRoom.channelId)).role, 'member');
});

test('V-17: mute, remove and readmit need the moderator above the target, as a kick on the homeserver does', async () => {
    const { canopyId, admin, moderator, member } = seedCanopy();
    const peer = seedUser();
    // A second moderator at 50, joined like the others.
    matrix.rooms.set(canopyId, [
        createEvent(),
        joinRulesEvent('public'),
        memberEvent(admin.mxid),
        memberEvent(moderator.mxid),
        memberEvent(peer.mxid),
        memberEvent(member.mxid),
        canopyPowerLevels({ [admin.mxid]: 100, [moderator.mxid]: 50, [peer.mxid]: 50 }),
    ]);
    const { channelId, roomId } = seedRoom(canopyId);
    const roomName = livekitRoomName(canopyId, channelId);
    for (const who of [admin, moderator, peer, member]) {
        await joinAs(who, canopyId, channelId);
        livekit.connect(roomName, who.id, [{ sid: `TR_${who.username}`, kind: 'audio' }]);
    }
    const everyone = [admin.id, moderator.id, peer.id, member.id].sort();
    const attempt = (actor: Caller, target: { id: string }, action: string) =>
        post(`/rooms/moderation/${action}`, actor, {
            canopyId,
            channelId,
            targetUserId: target.id,
        });

    // Equal or higher: refused, and nothing is done, recorded or asked of LiveKit.
    livekit.clearCalls();
    const refusedPairs: Array<[string, Caller, Caller]> = [
        ['a moderator on the admin', moderator, admin],
        ['a moderator on a fellow moderator', moderator, peer],
        ['a moderator on themselves', moderator, moderator],
        ['the admin on themselves', admin, admin],
    ];
    for (const [label, actor, target] of refusedPairs) {
        for (const action of ['mute', 'remove', 'readmit']) {
            matrix.clearCalls();
            assert.deepEqual(
                await refusal(await attempt(actor, target, action)),
                { status: 403, code: 'target_not_below_moderator' },
                `${label}: ${action}`
            );
            // Both standings came from one read of the canopy's state.
            assert.deepEqual(matrix.stateReads, [canopyId], `${label}: ${action}`);
        }
    }
    assert.deepEqual(livekit.calls, []);
    assert.deepEqual(moderationLog(roomId), []);
    assert.deepEqual(activeSanctions(roomId), []);
    assert.deepEqual(activeIds(roomId).sort(), everyone);

    // Above: the admin mutes and removes a moderator; a moderator removes a member.
    assert.equal((await attempt(admin, moderator, 'mute')).status, 200);
    assert.equal(livekit.participant(roomName, moderator.id)?.permission?.canPublish, false);
    assert.equal((await attempt(admin, peer, 'remove')).status, 200);
    assert.equal(livekit.participant(roomName, peer.id), undefined);
    assert.equal((await attempt(admin, peer, 'readmit')).status, 200);
    assert.equal((await attempt(moderator, member, 'remove')).status, 200);
    assert.equal(livekit.participant(roomName, member.id), undefined);
    assert.deepEqual(activeIds(roomId).sort(), [admin.id, moderator.id].sort());

    // Levels, not roles: where kick is 0 everyone at users_default is a
    // moderator, and none of them is above another.
    const flat = seedUser();
    const flatPeer = seedUser();
    const flatCanopy = newCanopyId();
    matrix.rooms.set(flatCanopy, [
        createEvent(),
        joinRulesEvent('public'),
        memberEvent(flat.mxid),
        memberEvent(flatPeer.mxid),
        powerLevelsEvent({ users_default: 0, kick: 0, events: { 'm.room.power_levels': 100 } }),
    ]);
    const flatRoom = seedRoom(flatCanopy);
    assert.equal((await joinAs(flat, flatCanopy, flatRoom.channelId)).role, 'moderator');
    assert.deepEqual(
        await refusal(
            await post('/rooms/moderation/mute', flat, {
                canopyId: flatCanopy,
                channelId: flatRoom.channelId,
                targetUserId: flatPeer.id,
            })
        ),
        { status: 403, code: 'target_not_below_moderator' }
    );

    // A target that is not in the canopy is judged by the level it would have
    // there (users_default), so a moderator can still remove a drop-in.
    const dropIn = seedUser();
    await joinAs(dropIn, canopyId, channelId);
    assert.equal((await attempt(moderator, dropIn, 'remove')).status, 200);

    // A target with no Blackout account: 404 for a moderator. A member is
    // refused before the target is looked up, and learns nothing about which
    // accounts exist.
    const nobody = { id: randomUUID() };
    assert.deepEqual(await refusal(await attempt(moderator, nobody, 'mute')), {
        status: 404,
        code: 'target_unknown',
    });
    assert.deepEqual(await refusal(await attempt(member, nobody, 'mute')), {
        status: 403,
        code: 'not_canopy_moderator',
    });
    assert.deepEqual(await refusal(await attempt(member, admin, 'mute')), {
        status: 403,
        code: 'not_canopy_moderator',
    });

    // A target level the state does not give as an integer is not guessed at,
    // whether the target is in the canopy (the whole read fails) or has left it
    // (the route refuses to compare).
    for (const membership of ['join', 'leave']) {
        matrix.rooms.set(canopyId, [
            createEvent(),
            joinRulesEvent('public'),
            memberEvent(admin.mxid),
            memberEvent(peer.mxid, membership),
            canopyPowerLevels({ [admin.mxid]: 100, [peer.mxid]: 'lots' }),
        ]);
        assert.deepEqual(
            await refusal(await attempt(admin, peer, 'mute')),
            { status: 503, code: 'canopy_check_unavailable' },
            membership
        );
    }
    assert.deepEqual(
        moderationLog(roomId).map(([eventType]) => eventType),
        ['mute', 'remove', 'readmit', 'remove', 'remove']
    );
});

test("V-18: a voice room's event feed is for joined members of the canopy, and tells outsiders nothing about which rooms exist", async () => {
    const { canopyId, admin, member } = seedCanopy();
    const { channelId, roomId } = seedRoom(canopyId);
    await joinAs(member, canopyId, channelId);
    const stranger = seedUser();
    const departed = seedUser();
    const invited = seedUser();
    const banned = seedUser();
    matrix.rooms.set(canopyId, [
        ...(matrix.rooms.get(canopyId) as StubStateEvent[]),
        memberEvent(departed.mxid, 'leave'),
        memberEvent(invited.mxid, 'invite'),
        memberEvent(banned.mxid, 'ban'),
    ]);
    const feed = (caller: Caller, canopy = canopyId, channel = channelId) =>
        app.request(
            `/v1/voice/rooms/${encodeURIComponent(canopy)}/${encodeURIComponent(channel)}/events`,
            {
                headers: {
                    authorization: `Bearer ${signJwt(caller.id, caller.username, 600)}`,
                    'x-forwarded-for': addressOf(caller.id),
                },
            }
        );

    // Joined members read it: who is in the room, the history, and the mutes
    // and removals that stand.
    assert.equal(
        (
            await post('/rooms/moderation/mute', admin, {
                canopyId,
                channelId,
                targetUserId: member.id,
            })
        ).status,
        200
    );
    for (const reader of [member, admin]) {
        const res = await feed(reader);
        assert.equal(res.status, 200);
        const body = (await res.json()) as {
            events: Array<{ eventType: string }>;
            activeParticipants: Array<{ userId: string }>;
            sanctions: Array<{ kind: string; userId: string }>;
        };
        assert.deepEqual(
            body.activeParticipants.map((p) => p.userId),
            [member.id]
        );
        assert.deepEqual(
            body.events.map((e) => e.eventType),
            ['join', 'mute']
        );
        assert.deepEqual(
            body.sanctions.map((s) => [s.kind, s.userId]),
            [['mute', member.id]]
        );
    }

    // Everyone else gets one answer, after the homeserver was asked, and the
    // same answer for a room that does not exist, for a channel that does not
    // exist in a canopy they are in, and for a canopy the homeserver does not
    // know: the feed is not a way to find out which rooms exist.
    const forbidden = { status: 403, code: 'forbidden' };
    const bodies = new Set<string>();
    for (const [label, caller] of Object.entries({ stranger, departed, invited, banned })) {
        matrix.clearCalls();
        const res = await feed(caller);
        assert.equal(res.status, 403, label);
        bodies.add(await res.text());
        assert.deepEqual(matrix.stateReads, [canopyId], label);
        assert.deepEqual(
            await refusal(await feed(caller, canopyId, 'no-such-channel')),
            forbidden,
            label
        );
    }
    const missingForMember = await feed(member, canopyId, 'no-such-channel');
    assert.equal(missingForMember.status, 403);
    bodies.add(await missingForMember.text());
    const unknownCanopy = await feed(stranger, newCanopyId(), 'main');
    assert.equal(unknownCanopy.status, 403);
    bodies.add(await unknownCanopy.text());
    assert.equal(bodies.size, 1, 'one body for every refusal');
    assert.deepEqual(activeIds(roomId), [member.id]);

    // When the homeserver cannot say, nothing is served.
    matrix.rooms.set(canopyId, 500);
    assert.deepEqual(await refusal(await feed(member)), {
        status: 503,
        code: 'canopy_check_unavailable',
    });
    const botToken = process.env.MATRIX_BOT_TOKEN;
    delete process.env.MATRIX_BOT_TOKEN;
    try {
        assert.deepEqual(await refusal(await feed(member)), {
            status: 503,
            code: 'matrix_not_configured',
        });
    } finally {
        process.env.MATRIX_BOT_TOKEN = botToken;
    }
});
