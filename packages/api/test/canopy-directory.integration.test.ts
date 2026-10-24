/**
 * The Blackout canopy directory, and who may list a canopy in it
 * (`POST /v1/discovery/index/canopies`, `src/services/canopyListingGate.ts`).
 *
 * Every session token carries `discovery.write`; listing a canopy, or changing
 * its entry, also takes being an admin of that canopy on the homeserver. The
 * homeserver is a stub (`_fixtures/matrixStub.ts`) answering the Synapse admin
 * room-state read the check makes; each test that expects the check to run
 * asserts that the read reached it.
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

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'wss://livekit.local';
process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? 'lk_test_key';
process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? 'lk_test_secret';
process.env.MATRIX_HOMESERVER = 'https://matrix.test.local';
process.env.MATRIX_BOT_TOKEN = 'syt_test_admin_token';
process.env.MATRIX_HOMESERVER_DOMAIN = 'test.local';

const matrix = createMatrixStub({ domain: 'test.local' });
globalThis.fetch = matrix.fetch;

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { __resetCanopyDirectoryForTests, getCanopy } = await import(
    '../src/services/canopyDirectory'
);

const seedUser = () => {
    const id = randomUUID();
    const username = `canopy-${id.slice(0, 8)}`;
    db.createUser({
        id,
        username,
        email: `${username}@example.com`,
        passwordHash: 'unused',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: 'pk',
    });
    return { id, username, mxid: matrix.mxid(username) };
};

const createEvent = (roomType?: string): StubStateEvent => ({
    type: 'm.room.create',
    state_key: '',
    content: roomType ? { type: roomType } : {},
});

/** The power levels Synapse gives a new room, with `admin` as its creator. */
const defaultPowerLevels = (admin: string, extraUsers: Record<string, unknown> = {}) =>
    powerLevelsEvent({
        users: { [admin]: 100, ...extraUsers },
        users_default: 0,
        events: { 'm.room.power_levels': 100, 'm.room.name': 50 },
        events_default: 0,
        state_default: 50,
    });

/** A canopy on the stub homeserver whose creator is `admin`. */
const seedSpace = (admin: string, extra: StubStateEvent[] = []) => {
    const roomId = `!space-${randomUUID().slice(0, 8)}:${matrix.domain}`;
    matrix.rooms.set(roomId, [
        createEvent('m.space'),
        memberEvent(admin),
        defaultPowerLevels(admin),
        ...extra,
    ]);
    return roomId;
};

const list = (
    user: { id: string; username: string },
    entry: Record<string, unknown>,
    capabilities?: string[]
) =>
    app.request('/v1/discovery/index/canopies', {
        method: 'POST',
        headers: {
            authorization: `Bearer ${signJwt(user.id, user.username, 600)}`,
            'content-type': 'application/json',
            ...(capabilities ? { 'x-blackout-capabilities': capabilities.join(',') } : {}),
        },
        body: JSON.stringify(entry),
    });

const readHeaders = (user: { id: string; username: string }) => ({
    authorization: `Bearer ${signJwt(user.id, user.username, 600)}`,
});

const refusal = async (res: Response) => ({
    status: res.status,
    code: ((await res.json()) as { code?: string }).code,
});

test('canopies list is empty before any registration', async () => {
    __resetCanopyDirectoryForTests();
    const response = await app.request('/v1/discovery/canopies', {
        headers: readHeaders(seedUser()),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { items: unknown[] };
    assert.deepEqual(body.items, []);
});

test('canopy index → list round-trip + federation tier filter', async () => {
    __resetCanopyDirectoryForTests();
    const admin = seedUser();
    const ids: Record<string, string> = {};

    for (const entry of [
        { key: 'gardens', name: 'Garden Canopy', federationTier: 'local' },
        { key: 'planet', name: 'Planet Canopy', federationTier: 'global' },
        { key: 'zone', name: 'Zone One', federationTier: 'zone' },
    ]) {
        ids[entry.key] = seedSpace(admin.mxid);
        const response = await list(admin, {
            canopyId: ids[entry.key],
            name: entry.name,
            federationTier: entry.federationTier,
        });
        assert.equal(response.status, 202);
    }

    const all = await app.request('/v1/discovery/canopies', { headers: readHeaders(admin) });
    const allBody = (await all.json()) as {
        items: Array<{ canopyId: string; federationTier: string }>;
    };
    assert.equal(allBody.items.length, 3);

    const onlyGlobal = await app.request('/v1/discovery/canopies?federationTier=global', {
        headers: readHeaders(admin),
    });
    const globalBody = (await onlyGlobal.json()) as {
        items: Array<{ canopyId: string; federationTier: string }>;
    };
    assert.equal(globalBody.items.length, 1);
    assert.equal(globalBody.items[0]!.canopyId, ids.planet);
});

test('canopy index requires write capability', async () => {
    __resetCanopyDirectoryForTests();
    const admin = seedUser();
    const canopyId = seedSpace(admin.mxid);
    // The session token carries discovery.write; a header without it narrows it away.
    const response = await list(admin, { canopyId, name: 'No Write' }, ['discovery.read']);
    assert.equal(response.status, 403);
    assert.equal(getCanopy(canopyId), null);
});

test('apps install rejects unknown canopy with code unknown_canopy', async () => {
    __resetCanopyDirectoryForTests();
    const response = await app.request('/v1/apps/directory/welcome-ops/install', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ canopyId: 'never-registered', permissions: ['members:read'] }),
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { code?: string };
    assert.equal(body.code, 'unknown_canopy');
});

test('apps install succeeds after canopy is registered', async () => {
    __resetCanopyDirectoryForTests();
    const admin = seedUser();
    const canopyId = seedSpace(admin.mxid);
    const listed = await list(admin, { canopyId, name: 'Ops Canopy' });
    assert.equal(listed.status, 202);
    const install = await app.request('/v1/apps/directory/welcome-ops/install', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ canopyId, permissions: ['members:read'] }),
    });
    assert.equal(install.status, 201);
});

test('L-1: the canopy admin lists their canopy; the API asked the homeserver', async () => {
    const admin = seedUser();
    const canopyId = seedSpace(admin.mxid);
    matrix.clearCalls();

    const res = await list(admin, { canopyId, name: 'Garden Co-op', summary: 'Seeds' });
    assert.equal(res.status, 202);
    assert.deepEqual(matrix.stateReads, [canopyId]);
    assert.equal(getCanopy(canopyId)?.name, 'Garden Co-op');
});

test('L-2: a member below the power-levels level, a stranger and a member who left are refused', async () => {
    const admin = seedUser();
    const member = seedUser();
    const stranger = seedUser();
    const departed = seedUser();
    const canopyId = `!space-${randomUUID().slice(0, 8)}:${matrix.domain}`;
    matrix.rooms.set(canopyId, [
        createEvent('m.space'),
        memberEvent(admin.mxid),
        memberEvent(member.mxid),
        memberEvent(departed.mxid, 'leave'),
        // The member holds a moderator's 50; the departed account kept its 100.
        defaultPowerLevels(admin.mxid, { [member.mxid]: 50, [departed.mxid]: 100 }),
    ]);

    for (const caller of [member, stranger, departed]) {
        matrix.clearCalls();
        const res = await list(caller, { canopyId, name: 'Hijacked' });
        assert.deepEqual(await refusal(res), { status: 403, code: 'not_canopy_admin' });
        assert.deepEqual(matrix.stateReads, [canopyId]);
    }
    assert.equal(getCanopy(canopyId), null);
});

test('L-3: an unknown room gets the same answer as a canopy the caller does not administer', async () => {
    const caller = seedUser();
    const res = await list(caller, { canopyId: `!missing:${matrix.domain}`, name: 'Ghost' });
    assert.deepEqual(await refusal(res), { status: 403, code: 'not_canopy_admin' });
});

test('L-4: a room that is not a space is refused, after the admin check', async () => {
    const admin = seedUser();
    const stranger = seedUser();
    const roomId = `!room-${randomUUID().slice(0, 8)}:${matrix.domain}`;
    matrix.rooms.set(roomId, [
        createEvent(),
        memberEvent(admin.mxid),
        defaultPowerLevels(admin.mxid),
    ]);

    assert.deepEqual(await refusal(await list(admin, { canopyId: roomId, name: 'A den' })), {
        status: 409,
        code: 'not_a_space',
    });
    // A stranger learns only "not an admin", not what kind of room it is.
    assert.deepEqual(await refusal(await list(stranger, { canopyId: roomId, name: 'A den' })), {
        status: 403,
        code: 'not_canopy_admin',
    });
    assert.equal(getCanopy(roomId), null);
});

test("L-5: an existing entry cannot be renamed by someone who is not the canopy's admin", async () => {
    const admin = seedUser();
    const other = seedUser();
    const canopyId = seedSpace(admin.mxid, [memberEvent(other.mxid)]);
    assert.equal((await list(admin, { canopyId, name: 'Garden Co-op' })).status, 202);

    const renamed = await list(other, {
        canopyId,
        name: 'Renamed by someone else',
        federationTier: 'global',
    });
    assert.deepEqual(await refusal(renamed), { status: 403, code: 'not_canopy_admin' });
    assert.equal(getCanopy(canopyId)?.name, 'Garden Co-op');
    assert.equal(getCanopy(canopyId)?.federationTier, 'local');

    // Its admin can still change it.
    assert.equal((await list(admin, { canopyId, name: 'Garden Co-op (open)' })).status, 202);
    assert.equal(getCanopy(canopyId)?.name, 'Garden Co-op (open)');
});

test('L-6: the level needed falls back to state_default, then 50; a user falls back to users_default', async () => {
    const cases: Array<{
        label: string;
        ok: boolean;
        levels: (self: string) => Record<string, unknown>;
    }> = [
        {
            label: 'no entry, no state_default: 50 reaches 50',
            ok: true,
            levels: (self) => ({ users: { [self]: 50 } }),
        },
        {
            label: 'no entry, no state_default: 49 is short',
            ok: false,
            levels: (self) => ({ users: { [self]: 49 } }),
        },
        {
            label: 'state_default 75: 74 is short',
            ok: false,
            levels: (self) => ({ users: { [self]: 74 }, state_default: 75 }),
        },
        {
            label: 'state_default 75: 75 reaches it',
            ok: true,
            levels: (self) => ({ users: { [self]: 75 }, state_default: 75 }),
        },
        {
            label: 'the events entry wins over state_default',
            ok: false,
            levels: (self) => ({
                users: { [self]: 75 },
                state_default: 50,
                events: { 'm.room.power_levels': 100 },
            }),
        },
        {
            label: 'users_default 100, no users entry',
            ok: true,
            levels: () => ({ users_default: 100 }),
        },
        {
            label: 'no users entry, no users_default: 0',
            ok: false,
            levels: () => ({ events: { 'm.room.power_levels': 1 } }),
        },
        {
            label: 'integer strings (room versions before 10)',
            ok: true,
            levels: (self) => ({
                users: { [self]: '100' },
                events: { 'm.room.power_levels': '100' },
            }),
        },
    ];

    for (const { levels, ok, label } of cases) {
        const caller = seedUser();
        const canopyId = `!space-${randomUUID().slice(0, 8)}:${matrix.domain}`;
        matrix.rooms.set(canopyId, [
            createEvent('m.space'),
            memberEvent(caller.mxid),
            powerLevelsEvent(levels(caller.mxid)),
        ]);
        const res = await list(caller, { canopyId, name: label });
        if (ok) {
            assert.equal(res.status, 202, label);
        } else {
            assert.deepEqual(await refusal(res), { status: 403, code: 'not_canopy_admin' }, label);
        }
    }
});

test('L-7: the check fails closed, with codes a client can tell apart from "not an admin"', async () => {
    const admin = seedUser();

    const unreadable = seedSpace(admin.mxid);
    matrix.rooms.set(unreadable, 500);
    assert.deepEqual(await refusal(await list(admin, { canopyId: unreadable, name: 'x' })), {
        status: 503,
        code: 'canopy_check_unavailable',
    });

    const unreachable = seedSpace(admin.mxid);
    matrix.onStateRead = () => {
        throw new Error('homeserver unreachable');
    };
    try {
        assert.deepEqual(await refusal(await list(admin, { canopyId: unreachable, name: 'x' })), {
            status: 503,
            code: 'canopy_check_unavailable',
        });
    } finally {
        matrix.onStateRead = null;
    }

    const malformed: Array<[string, StubStateEvent[]]> = [
        ['no power-levels event', [createEvent('m.space'), memberEvent(admin.mxid)]],
        [
            'a level that is not an integer',
            [
                createEvent('m.space'),
                memberEvent(admin.mxid),
                powerLevelsEvent({ users: { [admin.mxid]: 'lots' } }),
            ],
        ],
        ['no create event', [memberEvent(admin.mxid), defaultPowerLevels(admin.mxid)]],
    ];
    for (const [label, state] of malformed) {
        const canopyId = `!space-${randomUUID().slice(0, 8)}:${matrix.domain}`;
        matrix.rooms.set(canopyId, state);
        assert.deepEqual(
            await refusal(await list(admin, { canopyId, name: label })),
            { status: 503, code: 'canopy_check_unavailable' },
            label
        );
        assert.equal(getCanopy(canopyId), null, label);
    }

    const noBot = seedSpace(admin.mxid);
    const botToken = process.env.MATRIX_BOT_TOKEN;
    delete process.env.MATRIX_BOT_TOKEN;
    try {
        assert.deepEqual(await refusal(await list(admin, { canopyId: noBot, name: 'x' })), {
            status: 503,
            code: 'matrix_not_configured',
        });
    } finally {
        process.env.MATRIX_BOT_TOKEN = botToken;
    }

    // A valid token whose account is gone has no Matrix id to check.
    const ghost = { id: randomUUID(), username: 'deleted-account' };
    const orphaned = seedSpace(matrix.mxid(ghost.username));
    assert.deepEqual(await refusal(await list(ghost, { canopyId: orphaned, name: 'x' })), {
        status: 401,
        code: 'account_unknown',
    });

    for (const canopyId of [unreadable, unreachable, noBot, orphaned]) {
        assert.equal(getCanopy(canopyId), null);
    }
});
