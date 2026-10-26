/**
 * Who may link two communities (`POST /v1/federation/links`).
 *
 * Until 2026-10-26 the route took no session and linked any two community ids
 * for anyone (F6 in docs/security/api-findings-triage-2026-10-25.md). A link
 * is a public statement about both communities (`GET /communities` reports
 * it), so it now takes a session and being an admin of both, each as a canopy
 * on the homeserver: the standing listing a canopy takes
 * (`services/canopyListingGate.ts`). The homeserver is a stub
 * (`_fixtures/matrixStub.ts`) answering the Synapse admin room-state read.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';
import {
    createMatrixStub,
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
process.env.MATRIX_HOMESERVER_DOMAIN = 'test.local';

const matrix = createMatrixStub({ domain: 'test.local' });
globalThis.fetch = matrix.fetch;

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');

const seedUser = () => {
    const id = randomUUID();
    const username = `fed-${id.slice(0, 8)}`;
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

type Caller = { id: string; username: string } | null;

/** A canopy whose creator is `admin`; `users` adds power levels, `extra` state. */
const seedCanopy = (
    admin: string,
    options: { users?: Record<string, number>; extra?: StubStateEvent[]; roomType?: string } = {}
) => {
    const roomId = `!space-${randomUUID().slice(0, 8)}:${matrix.domain}`;
    matrix.rooms.set(roomId, [
        {
            type: 'm.room.create',
            state_key: '',
            content: { type: options.roomType ?? 'm.space' },
        },
        memberEvent(admin),
        powerLevelsEvent({
            users: { [admin]: 100, ...(options.users ?? {}) },
            users_default: 0,
            events: { 'm.room.power_levels': 100 },
            state_default: 50,
        }),
        ...(options.extra ?? []),
    ]);
    return roomId;
};

const link = (caller: Caller, sourceCommunityId: string, targetCommunityId: string) =>
    app.request('/v1/federation/links', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(caller
                ? { authorization: `Bearer ${signJwt(caller.id, caller.username, 600)}` }
                : {}),
        },
        body: JSON.stringify({ sourceCommunityId, targetCommunityId, linkType: 'alliance' }),
    });

const refusal = async (res: Response) => {
    const body = (await res.json()) as { code?: string; side?: string };
    return { status: res.status, code: body.code, side: body.side };
};

const linked = async (...ids: string[]) => {
    const res = await app.request(`/v1/federation/communities?ids=${ids.join(',')}`);
    return ((await res.json()) as { communities: string[] }).communities.sort();
};

test('without a session a link is refused 401, nothing is linked and the homeserver is not asked', async () => {
    const admin = seedUser();
    const a = seedCanopy(admin.mxid);
    const b = seedCanopy(admin.mxid);
    const before = db.federationLinks.size;
    matrix.clearCalls();

    assert.equal((await link(null, a, b)).status, 401);
    assert.equal(db.federationLinks.size, before);
    assert.deepEqual(await linked(a, b), []);
    assert.deepEqual(matrix.stateReads, []);
});

test('an admin of one side only, a moderator of both and a stranger are refused, and nothing is linked', async () => {
    const alice = seedUser();
    const bob = seedUser();
    const moderator = seedUser();
    const stranger = seedUser();
    const extra = [memberEvent(moderator.mxid)];
    const users = { [moderator.mxid]: 50 };
    const alicesCanopy = seedCanopy(alice.mxid, { users, extra });
    const bobsCanopy = seedCanopy(bob.mxid, { users, extra });
    const before = db.federationLinks.size;

    // Alice runs the source but not the target, and the other way round.
    assert.deepEqual(await refusal(await link(alice, alicesCanopy, bobsCanopy)), {
        status: 403,
        code: 'not_canopy_admin',
        side: 'target',
    });
    assert.deepEqual(await refusal(await link(alice, bobsCanopy, alicesCanopy)), {
        status: 403,
        code: 'not_canopy_admin',
        side: 'source',
    });
    for (const caller of [moderator, stranger]) {
        assert.deepEqual(await refusal(await link(caller, alicesCanopy, bobsCanopy)), {
            status: 403,
            code: 'not_canopy_admin',
            side: 'source',
        });
    }
    // An id that is no room at all reads the same as a canopy the caller does not run.
    assert.deepEqual(await refusal(await link(alice, alicesCanopy, `!missing:${matrix.domain}`)), {
        status: 403,
        code: 'not_canopy_admin',
        side: 'target',
    });

    assert.equal(db.federationLinks.size, before);
    assert.deepEqual(await linked(alicesCanopy, bobsCanopy), []);
});

test('an admin of both canopies links them; the homeserver was asked about each', async () => {
    const admin = seedUser();
    const a = seedCanopy(admin.mxid);
    const b = seedCanopy(admin.mxid);
    const before = db.federationLinks.size;
    matrix.clearCalls();

    const res = await link(admin, a, b);
    assert.equal(res.status, 201);
    const created = (await res.json()) as {
        sourceCommunityId: string;
        targetCommunityId: string;
        linkType: string;
    };
    assert.deepEqual(
        [created.sourceCommunityId, created.targetCommunityId, created.linkType],
        [a, b, 'alliance']
    );
    assert.deepEqual(matrix.stateReads, [a, b]);
    assert.equal(db.federationLinks.size, before + 1);
    assert.deepEqual(await linked(a, b), [a, b].sort());
});

test('a room that is not a space is refused after the admin check', async () => {
    const admin = seedUser();
    const space = seedCanopy(admin.mxid);
    const room = seedCanopy(admin.mxid, { roomType: 'm.room' });
    const before = db.federationLinks.size;

    assert.deepEqual(await refusal(await link(admin, space, room)), {
        status: 409,
        code: 'not_a_space',
        side: 'target',
    });
    assert.equal(db.federationLinks.size, before);
});

test('the check fails closed when the homeserver cannot answer', async () => {
    const admin = seedUser();
    const a = seedCanopy(admin.mxid);
    const unreadable = seedCanopy(admin.mxid);
    matrix.rooms.set(unreadable, 500);
    const before = db.federationLinks.size;

    assert.deepEqual(await refusal(await link(admin, a, unreadable)), {
        status: 503,
        code: 'canopy_check_unavailable',
        side: 'target',
    });

    const b = seedCanopy(admin.mxid);
    const botToken = process.env.MATRIX_BOT_TOKEN;
    delete process.env.MATRIX_BOT_TOKEN;
    try {
        assert.deepEqual(await refusal(await link(admin, a, b)), {
            status: 503,
            code: 'matrix_not_configured',
            side: 'source',
        });
    } finally {
        process.env.MATRIX_BOT_TOKEN = botToken;
    }

    assert.equal(db.federationLinks.size, before);
    assert.deepEqual(await linked(a, b, unreadable), []);
});
