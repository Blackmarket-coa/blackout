/**
 * Who may install an app in a canopy, revoke it, or record an action run there
 * (`POST /v1/apps/directory/:appId/install`, `/revoke`, `/v1/apps/actions/:action`).
 *
 * Until 2026-10-26 the three routes checked no session: anyone, signed in or
 * not, could install or revoke any app for any listed canopy and spend an
 * installation's action quota (F5 in
 * docs/security/api-findings-triage-2026-10-25.md). Each now takes a session
 * and being an admin of the canopy on the homeserver, the standing listing it
 * takes (`services/canopyListingGate.ts`). The homeserver is a stub
 * (`_fixtures/matrixStub.ts`) answering the Synapse admin room-state read;
 * each test that expects the check to run asserts the read reached it.
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
const { upsertCanopy } = await import('../src/services/canopyDirectory');
const { getObservability, listInstallations } = await import('../src/services/apps');

const APP = 'welcome-ops';

const seedUser = () => {
    const id = randomUUID();
    const username = `apps-${id.slice(0, 8)}`;
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

/** A listed canopy on the stub homeserver: `admin` created it; `extra` adds state. */
const seedCanopy = (
    admin: string,
    options: { users?: Record<string, number>; extra?: StubStateEvent[]; listed?: boolean } = {}
) => {
    const canopyId = `!space-${randomUUID().slice(0, 8)}:${matrix.domain}`;
    matrix.rooms.set(canopyId, [
        { type: 'm.room.create', state_key: '', content: { type: 'm.space' } },
        memberEvent(admin),
        powerLevelsEvent({
            users: { [admin]: 100, ...(options.users ?? {}) },
            users_default: 0,
            events: { 'm.room.power_levels': 100 },
            state_default: 50,
            kick: 50,
        }),
        ...(options.extra ?? []),
    ]);
    if (options.listed !== false) upsertCanopy({ canopyId, name: 'Ops Canopy' });
    return canopyId;
};

const post = (caller: Caller, path: string, body: Record<string, unknown>) =>
    app.request(path, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(caller
                ? { authorization: `Bearer ${signJwt(caller.id, caller.username, 600)}` }
                : {}),
        },
        body: JSON.stringify(body),
    });

const install = (caller: Caller, canopyId: string) =>
    post(caller, `/v1/apps/directory/${APP}/install`, { canopyId, permissions: ['members:read'] });
const revoke = (caller: Caller, canopyId: string) =>
    post(caller, `/v1/apps/directory/${APP}/revoke`, { canopyId });
const runAction = (caller: Caller, canopyId: string) =>
    post(caller, '/v1/apps/actions/post_message', { appId: APP, canopyId, latencyMs: 12 });

const refusal = async (res: Response) => ({
    status: res.status,
    code: ((await res.json()) as { code?: string }).code,
});

const installState = (canopyId: string) => ({
    installs: listInstallations(canopyId).map((entry) => entry.status),
    requests: getObservability(APP, canopyId)?.requestCount ?? null,
});

test('without a session, install, revoke and action are refused 401 and nothing is written', async () => {
    const admin = seedUser();
    const canopyId = seedCanopy(admin.mxid);
    matrix.clearCalls();

    for (const call of [install, revoke, runAction]) {
        assert.deepEqual(await refusal(await call(null, canopyId)), {
            status: 401,
            code: 'unauthorized',
        });
    }
    assert.deepEqual(installState(canopyId), { installs: [], requests: null });
    // Refused before the homeserver is asked.
    assert.deepEqual(matrix.stateReads, []);
});

test('a moderator, a plain member, a stranger and an admin who left are refused and nothing is written', async () => {
    const admin = seedUser();
    const moderator = seedUser();
    const member = seedUser();
    const stranger = seedUser();
    const departed = seedUser();
    const canopyId = seedCanopy(admin.mxid, {
        users: { [moderator.mxid]: 50, [departed.mxid]: 100 },
        extra: [
            memberEvent(moderator.mxid),
            memberEvent(member.mxid),
            memberEvent(departed.mxid, 'leave'),
        ],
    });

    for (const caller of [moderator, member, stranger, departed]) {
        for (const call of [install, runAction, revoke]) {
            matrix.clearCalls();
            assert.deepEqual(await refusal(await call(caller, canopyId)), {
                status: 403,
                code: 'not_canopy_admin',
            });
            assert.deepEqual(matrix.stateReads, [canopyId]);
        }
    }
    assert.deepEqual(installState(canopyId), { installs: [], requests: null });
});

test("the canopy's admin installs, runs an action and revokes; the homeserver was asked each time", async () => {
    const admin = seedUser();
    const canopyId = seedCanopy(admin.mxid);

    matrix.clearCalls();
    assert.equal((await install(admin, canopyId)).status, 201);
    assert.deepEqual(matrix.stateReads, [canopyId]);
    assert.deepEqual(installState(canopyId), { installs: ['active'], requests: 0 });

    matrix.clearCalls();
    assert.equal((await runAction(admin, canopyId)).status, 200);
    assert.deepEqual(matrix.stateReads, [canopyId]);
    assert.deepEqual(installState(canopyId), { installs: ['active'], requests: 1 });

    matrix.clearCalls();
    assert.equal((await revoke(admin, canopyId)).status, 200);
    assert.deepEqual(matrix.stateReads, [canopyId]);
    assert.deepEqual(installState(canopyId), { installs: ['revoked'], requests: 1 });
});

test("an admin's install cannot be revoked or spent by anyone else", async () => {
    const admin = seedUser();
    const moderator = seedUser();
    const canopyId = seedCanopy(admin.mxid, {
        users: { [moderator.mxid]: 50 },
        extra: [memberEvent(moderator.mxid)],
    });
    assert.equal((await install(admin, canopyId)).status, 201);

    const refusals: Array<[Caller, number]> = [
        [null, 401],
        [moderator, 403],
        [seedUser(), 403],
    ];
    for (const [caller, status] of refusals) {
        assert.equal((await runAction(caller, canopyId)).status, status);
        assert.equal((await revoke(caller, canopyId)).status, status);
    }
    assert.deepEqual(installState(canopyId), { installs: ['active'], requests: 0 });
});

test('a non-admin learns nothing about an unlisted canopy; its admin is told it is not listed', async () => {
    const admin = seedUser();
    const stranger = seedUser();
    const unlisted = seedCanopy(admin.mxid, { listed: false });

    assert.deepEqual(await refusal(await install(stranger, unlisted)), {
        status: 403,
        code: 'not_canopy_admin',
    });
    assert.deepEqual(await refusal(await install(stranger, `!missing:${matrix.domain}`)), {
        status: 403,
        code: 'not_canopy_admin',
    });
    assert.deepEqual(await refusal(await install(admin, unlisted)), {
        status: 400,
        code: 'unknown_canopy',
    });
    assert.deepEqual(installState(unlisted), { installs: [], requests: null });
});

test('the check fails closed when the homeserver cannot answer', async () => {
    const admin = seedUser();

    const unreadable = seedCanopy(admin.mxid);
    matrix.rooms.set(unreadable, 500);
    for (const call of [install, runAction, revoke]) {
        assert.deepEqual(await refusal(await call(admin, unreadable)), {
            status: 503,
            code: 'canopy_check_unavailable',
        });
    }

    const noBot = seedCanopy(admin.mxid);
    const botToken = process.env.MATRIX_BOT_TOKEN;
    delete process.env.MATRIX_BOT_TOKEN;
    try {
        assert.deepEqual(await refusal(await install(admin, noBot)), {
            status: 503,
            code: 'matrix_not_configured',
        });
    } finally {
        process.env.MATRIX_BOT_TOKEN = botToken;
    }

    // A valid session whose account is gone has no Matrix id to check.
    const ghost = { id: randomUUID(), username: 'deleted-account' };
    const orphaned = seedCanopy(matrix.mxid(ghost.username));
    assert.deepEqual(await refusal(await install(ghost, orphaned)), {
        status: 401,
        code: 'account_unknown',
    });

    for (const canopyId of [unreadable, noBot, orphaned]) {
        assert.deepEqual(installState(canopyId), { installs: [], requests: null });
    }
});
