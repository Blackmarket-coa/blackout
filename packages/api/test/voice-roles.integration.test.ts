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
 * read reached it.
 * Record: O4 in `docs/security/capability-header-triage-2026-10-23.md`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
    createMatrixStub,
    memberEvent,
    powerLevelsEvent,
    type StubStateEvent,
} from './_fixtures/matrixStub';
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

/** A listed canopy whose creator is at 100, a moderator at 50 and a member at 0, all joined. */
const seedCanopy = () => {
    const admin = seedUser();
    const moderator = seedUser();
    const member = seedUser();
    const canopyId = newCanopyId();
    matrix.rooms.set(canopyId, [
        createEvent(),
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

/** The role a LiveKit token carries in its `metadata` claim. */
const tokenRole = (token: string): string => {
    const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as {
        metadata: string;
    };
    return (JSON.parse(payload.metadata) as { role: string }).role;
};

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
    for (const action of ['lock', 'mute', 'remove']) {
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
    assert.equal(
        (await post('/rooms/moderation/lock', moderator, { canopyId, channelId })).status,
        200
    );
    assert.equal(isLocked(canopyId, channelId), true);
    assert.deepEqual(moderationLog(roomId), [
        ['mute', moderator.id, 'moderator'],
        ['remove', moderator.id, 'moderator'],
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

test('V-4: a caller who is not joined to the canopy gets no role, whatever their level', async () => {
    const { canopyId, admin } = seedCanopy();
    const stranger = seedUser();
    const departed = seedUser();
    const invited = seedUser();
    const banned = seedUser();
    matrix.rooms.set(canopyId, [
        createEvent(),
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
        assert.deepEqual(
            await refusal(
                await post('/rooms/join', caller, { canopyId, channelId: locked.channelId })
            ),
            { status: 423, code: 'room_locked' },
            label
        );
        // Unchanged: an unlocked room is drop-in (`/rooms/open` lists it to every
        // signed-in account), so they join it, as a member. That includes an
        // account the canopy banned (recorded in the triage record).
        assert.equal((await joinAs(caller, canopyId, open.channelId)).role, 'member', label);
    }
    assert.equal(db.getVoiceRoom(canopyId, otherChannel), undefined);
    assert.equal(isLocked(canopyId, open.channelId), false);
    assert.deepEqual(activeIds(locked.roomId), []);
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
            for (const action of ['lock', 'mute', 'remove']) {
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
