/**
 * The id bridge (`services/userIdentity.ts`) must only resolve a Matrix id on
 * THIS homeserver. Until 2026-10-25 it took the localpart of any MXID and
 * ignored the server name, so `@alice:elsewhere.example` resolved to the local
 * `alice`, and every route that accepts a Matrix id acted on the local account
 * of the same name (docs/security/api-findings-triage-2026-10-25.md, finding 2).
 */
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
process.env.MATRIX_HOMESERVER_DOMAIN = 'test.local';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const {
    homeserverDomain,
    isLocalMatrixId,
    matrixLocalpart,
    matrixUserIdFor,
    parseMatrixId,
    resolveBlackoutUserId,
} = await import('../src/services/userIdentity');

const seedUser = () => {
    const id = randomUUID();
    const username = `id-${id.slice(0, 8)}`;
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

const auth = (user: { id: string; username: string }) => ({
    authorization: `Bearer ${signJwt(user.id, user.username, 600)}`,
    'content-type': 'application/json',
});

test('the server name comes from MATRIX_HOMESERVER_DOMAIN and is what matrixUserIdFor emits', () => {
    const alice = seedUser();
    assert.equal(homeserverDomain(), 'test.local');
    assert.equal(matrixUserIdFor(alice.id), `@${alice.username}:test.local`);
    assert.equal(matrixUserIdFor(randomUUID()), null);
});

test('parseMatrixId splits an MXID and keeps a port in the server name', () => {
    assert.deepEqual(parseMatrixId('@alice:test.local'), {
        localpart: 'alice',
        serverName: 'test.local',
    });
    assert.deepEqual(parseMatrixId('@alice:hs.example:8448'), {
        localpart: 'alice',
        serverName: 'hs.example:8448',
    });
    assert.equal(parseMatrixId('alice'), null);
    assert.equal(parseMatrixId('@alice'), null);
    assert.equal(parseMatrixId('@:test.local'), null);
});

test('a Matrix id resolves to a Blackout account only on this homeserver', () => {
    const alice = seedUser();
    assert.equal(resolveBlackoutUserId(alice.id), alice.id, 'a Blackout id is itself');
    assert.equal(resolveBlackoutUserId(`@${alice.username}:test.local`), alice.id, 'a local MXID');

    for (const foreign of [
        `@${alice.username}:elsewhere.example`,
        `@${alice.username}:test.local.elsewhere.example`,
        `@${alice.username}:elsewhere.example:8448`,
        // Server names are compared exactly: this homeserver never mints these.
        `@${alice.username}:TEST.LOCAL`,
        `@${alice.username}:test.local `,
    ]) {
        assert.equal(resolveBlackoutUserId(foreign), null, `${JSON.stringify(foreign)} is unknown`);
        assert.equal(matrixLocalpart(foreign), null);
        assert.equal(isLocalMatrixId(foreign), false);
    }
    assert.equal(matrixLocalpart(`@${alice.username}:test.local`), alice.username);
    assert.equal(isLocalMatrixId(`@${alice.username}:test.local`), true);
    assert.equal(resolveBlackoutUserId(`@nobody-${randomUUID().slice(0, 8)}:test.local`), null);
    assert.equal(resolveBlackoutUserId(alice.username), null, 'a bare username is not an id');
});

test('following a foreign MXID that shares a local username follows nobody (POST /v1/circle)', async () => {
    const alice = seedUser();
    const bob = seedUser();
    const follow = (followeeId: string) =>
        app.request('/v1/circle', {
            method: 'POST',
            headers: auth(alice),
            body: JSON.stringify({ followeeId }),
        });

    const foreign = await follow(`@${bob.username}:elsewhere.example`);
    assert.equal(foreign.status, 404);
    assert.equal(((await foreign.json()) as { code: string }).code, 'not_found');

    const local = await follow(`@${bob.username}:test.local`);
    assert.equal(local.status, 201);
    assert.equal(((await local.json()) as { following: boolean }).following, true);
});

test('a profile-surface lookup by a foreign MXID finds no account (GET /v1/coalitions/users/:userId)', async () => {
    const alice = seedUser();
    const local = await app.request(
        `/v1/coalitions/users/${encodeURIComponent(`@${alice.username}:test.local`)}`
    );
    assert.equal(local.status, 200);

    const foreign = await app.request(
        `/v1/coalitions/users/${encodeURIComponent(`@${alice.username}:elsewhere.example`)}`
    );
    assert.equal(foreign.status, 404);
});
