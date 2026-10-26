/**
 * The release-identity directory (`/v1/release-identities`): publishing
 * one's own identity, checked as the clients check it; history kept as
 * superseded; reads by account id and by Matrix id, on this homeserver only;
 * one answer for nobody; removal with the account; the account export.
 * docs/security/release-identities-2026-10-26.md.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';
import type { ReleaseIdentity } from '@blackout/protocol';

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
const lifecycle = await import('../src/services/accountLifecycle');
const protocol = await import('@blackout/protocol');
const { ALICE, BOB } = await import('../../blackout-protocol/src/release/testVectors');

// The API configures no KEM provider; only this test's own key generation
// needs one. The server's checks run without it.
protocol.setKemProvider(protocol.mlKem768Provider);

type Entry = {
    accountId: string;
    matrixId: string | null;
    current: { identity: ReleaseIdentity; fingerprint: string; publishedAt: string } | null;
    superseded: Array<{ fingerprint: string; publishedAt: string; supersededAt?: string }>;
    changed?: boolean;
};

const seedUser = (id: string = randomUUID(), username?: string) => {
    const name = username ?? `ri-${id.slice(0, 8)}`;
    db.createUser({
        id,
        username: name,
        email: `${name}@example.com`,
        passwordHash: 'unused',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: 'pk',
    });
    return { id, username: name };
};

const headers = (user: { id: string; username: string }) => ({
    authorization: `Bearer ${signJwt(user.id, user.username, 600)}`,
    'content-type': 'application/json',
});

const publish = (user: { id: string; username: string }, identity: unknown) =>
    app.request('/v1/release-identities/me', {
        method: 'PUT',
        headers: headers(user),
        body: JSON.stringify({ identity }),
    });

const get = (user: { id: string; username: string }, path: string) =>
    app.request(`/v1/release-identities${path}`, { headers: headers(user) });

const freshIdentity = async (accountId: string): Promise<ReleaseIdentity> =>
    (await protocol.createReleaseKeySet(accountId)).identity;

// The vectors' accounts, so the server checks the very identities the
// client's known-answer tests pin.
const alice = seedUser(ALICE.identity.accountId, 'alice-vector');
const bob = seedUser(BOB.identity.accountId, 'bob-vector');

test('every route needs a signed-in caller', async () => {
    for (const [method, path] of [
        ['GET', '/v1/release-identities/me'],
        ['PUT', '/v1/release-identities/me'],
        ['GET', `/v1/release-identities/${alice.id}`],
        ['GET', '/v1/release-identities/lookup?matrixId=%40alice-vector%3Atest.local'],
    ]) {
        const res = await app.request(path, { method });
        assert.equal(res.status, 401, `${method} ${path}`);
    }
});

test('an account sees its own empty entry before publishing', async () => {
    const user = seedUser();
    const res = await get(user, '/me');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
        accountId: user.id,
        matrixId: `@${user.username}:test.local`,
        current: null,
        superseded: [],
    });
});

test('the vector identity publishes, with the fingerprint the client computes', async () => {
    const res = await publish(alice, ALICE.identity);
    assert.equal(res.status, 201);
    const body = (await res.json()) as Entry;
    assert.equal(body.changed, true);
    assert.equal(body.accountId, alice.id);
    assert.equal(body.matrixId, '@alice-vector:test.local');
    assert.deepEqual(body.current?.identity, ALICE.identity);
    assert.equal(body.current?.fingerprint, ALICE.fingerprint);
    assert.deepEqual(body.superseded, []);

    // The same identity again changes nothing.
    const again = await publish(alice, ALICE.identity);
    assert.equal(again.status, 200);
    assert.equal(((await again.json()) as Entry).changed, false);
    assert.equal(db.listReleaseIdentitiesForAccount(alice.id).length, 1);
});

test('a new identity replaces the current one, which stays listed as superseded', async () => {
    const user = seedUser();
    const first = await freshIdentity(user.id);
    const second = await freshIdentity(user.id);
    assert.equal((await publish(user, first)).status, 201);
    const res = await publish(user, second);
    assert.equal(res.status, 201);
    const body = (await res.json()) as Entry;
    assert.deepEqual(body.current?.identity, second);
    assert.equal(body.superseded.length, 1);
    const old = body.superseded[0];
    const firstCheck = await protocol.verifyReleaseIdentity(first);
    assert.ok(firstCheck.ok);
    assert.equal(old.fingerprint, firstCheck.fingerprint);
    assert.ok(old.supersededAt, 'the replaced identity says when it was replaced');

    // Publishing the old one again makes it current again, as a new entry.
    const back = (await (await publish(user, first)).json()) as Entry;
    assert.equal(back.current?.fingerprint, firstCheck.fingerprint);
    assert.equal(back.superseded.length, 2);
});

test('nobody publishes an identity for another account', async () => {
    const user = seedUser();
    const res = await publish(user, ALICE.identity);
    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as { code: string }).code, 'release_identity_not_yours');
    assert.equal(db.listReleaseIdentitiesForAccount(user.id).length, 0);
    // Not even one signed by the caller, naming someone else.
    const signedByCaller = await freshIdentity(bob.id);
    assert.equal((await publish(user, signedByCaller)).status, 403);
    // The route refuses before checking anything else: a broken identity
    // naming someone else is "not yours", not "invalid".
    const broken = { ...ALICE.identity, signature: BOB.identity.signature };
    assert.equal((await publish(user, broken)).status, 403);
    // And the service refuses on its own, whoever calls it.
    const { publishReleaseIdentity } = await import('../src/services/releaseIdentities');
    assert.deepEqual(await publishReleaseIdentity(user.id, ALICE.identity), { kind: 'not_yours' });
    assert.equal(db.listReleaseIdentitiesForAccount(user.id).length, 0);
});

test('the API refuses what the client would refuse, saying why', async () => {
    const user = seedUser();
    const good = await freshIdentity(user.id);
    const flipped = Buffer.from(good.signature, 'base64');
    flipped[40] ^= 0x01;
    const smallOrder = Buffer.alloc(32).toString('base64');
    const cases: Array<[string, unknown, string]> = [
        [
            'a flipped signature bit',
            { ...good, signature: flipped.toString('base64') },
            'signature',
        ],
        [
            'another identity’s signature',
            { ...good, signature: ALICE.identity.signature },
            'signature',
        ],
        ['a changed X25519 key', { ...good, x25519Key: BOB.identity.x25519Key }, 'signature'],
        ['a small-order X25519 key', { ...good, x25519Key: smallOrder }, 'x25519_key'],
        ['a short signing key', { ...good, signingKey: 'AAAA' }, 'signing_key'],
    ];
    for (const [label, identity, reason] of cases) {
        const res = await publish(user, identity);
        assert.equal(res.status, 400, label);
        const body = (await res.json()) as { code: string; reason: string };
        assert.equal(body.code, 'invalid_release_identity', label);
        assert.equal(body.reason, reason, label);
    }
    assert.equal(db.listReleaseIdentitiesForAccount(user.id).length, 0, 'nothing was stored');
});

test('a body carrying anything besides the six public fields is refused whole', async () => {
    const user = seedUser();
    const keySet = await protocol.createReleaseKeySet(user.id);
    for (const identity of [
        { ...keySet.identity, signingPrivateJwk: keySet.signingPrivateJwk },
        { ...keySet.identity, v: 2 },
        (({ signature: _signature, ...rest }) => rest)(keySet.identity),
    ]) {
        const res = await publish(user, identity);
        assert.equal(res.status, 400);
        assert.equal(((await res.json()) as { code: string }).code, 'invalid_request');
    }
    const extraTopLevel = await app.request('/v1/release-identities/me', {
        method: 'PUT',
        headers: headers(user),
        body: JSON.stringify({ identity: keySet.identity, keySet }),
    });
    assert.equal(extraTopLevel.status, 400);
    assert.equal(db.listReleaseIdentitiesForAccount(user.id).length, 0);
});

test('an account keeps at most 32 identities; the next one is refused', async () => {
    const user = seedUser();
    for (let i = 0; i < protocol.RELEASE_IDENTITY_HISTORY_LIMIT; i += 1) {
        db.publishReleaseIdentity({
            id: randomUUID(),
            accountId: user.id,
            formatVersion: 1,
            signingKey: 'seeded',
            x25519Key: 'seeded',
            mlkem768Key: 'seeded',
            signature: 'seeded',
            fingerprint: `${i}`.padStart(64, '0'),
        });
    }
    const res = await publish(user, await freshIdentity(user.id));
    assert.equal(res.status, 409);
    assert.equal(((await res.json()) as { code: string }).code, 'release_identity_limit');
    assert.equal(
        db.listReleaseIdentitiesForAccount(user.id).length,
        protocol.RELEASE_IDENTITY_HISTORY_LIMIT
    );
});

test('anyone signed in reads an entry by account id; nobody gets one answer', async () => {
    const reader = seedUser();
    assert.equal((await publish(bob, BOB.identity)).status, 201);
    const res = await get(reader, `/${bob.id}`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as Entry;
    assert.deepEqual(body.current?.identity, BOB.identity);

    const withoutIdentity = seedUser();
    const misses = [
        await get(reader, `/${withoutIdentity.id}`),
        await get(reader, `/${randomUUID()}`),
    ];
    const bodies = await Promise.all(misses.map((miss) => miss.json()));
    for (const miss of misses) assert.equal(miss.status, 404);
    assert.deepEqual(bodies[0], {
        code: 'release_identity_not_found',
        message: 'No release identity',
    });
    assert.deepEqual(bodies[1], bodies[0], 'no account and no identity look the same');
});

test('a lookup by Matrix id finds only this homeserver’s exact Matrix id', async () => {
    const reader = seedUser();
    assert.ok([200, 201].includes((await publish(bob, BOB.identity)).status));
    const lookup = (matrixId: string) =>
        get(reader, `/lookup?matrixId=${encodeURIComponent(matrixId)}`);

    const found = await lookup('@bob-vector:test.local');
    assert.equal(found.status, 200);
    assert.deepEqual(((await found.json()) as Entry).current?.identity, BOB.identity);

    const misses = [
        // The same localpart on another server is another server's account.
        '@bob-vector:elsewhere.example',
        '@bob-vector:test.local.elsewhere.example',
        '@bob-vector:test.local:8448',
        // Matrix ids are compared exactly.
        '@Bob-Vector:test.local',
        // An account id is not a Matrix id.
        bob.id,
        '@bob-vector',
        'bob-vector:test.local',
        // An account without an identity.
        `@${reader.username}:test.local`,
        '@nobody-here:test.local',
    ];
    for (const matrixId of misses) {
        const res = await lookup(matrixId);
        assert.equal(res.status, 404, matrixId);
        assert.deepEqual(await res.json(), {
            code: 'release_identity_not_found',
            message: 'No release identity',
        });
    }

    const missing = await get(reader, '/lookup');
    assert.equal(missing.status, 400);
});

test('account deletion removes the account’s identities, current and superseded', async () => {
    const user = seedUser();
    const reader = seedUser();
    assert.ok([200, 201].includes((await publish(bob, BOB.identity)).status));
    await publish(user, await freshIdentity(user.id));
    await publish(user, await freshIdentity(user.id));
    assert.equal(db.listReleaseIdentitiesForAccount(user.id).length, 2);

    const issued = lifecycle.requestAccountDeletion({ userId: user.id });
    assert.ok(issued);
    assert.equal(lifecycle.confirmAccountDeletion(issued!.token, user.id).kind, 'ok');

    assert.equal(db.listReleaseIdentitiesForAccount(user.id).length, 0);
    assert.equal((await get(reader, `/${user.id}`)).status, 404);
    assert.equal(
        (
            await get(
                reader,
                `/lookup?matrixId=${encodeURIComponent(`@${user.username}:test.local`)}`
            )
        ).status,
        404
    );
    // Other accounts' identities stay.
    assert.equal((await get(reader, `/${bob.id}`)).status, 200);
});

test('the account export lists the caller’s identities and nobody else’s', async () => {
    const user = seedUser();
    const first = await freshIdentity(user.id);
    await publish(user, first);
    await publish(user, await freshIdentity(user.id));

    const res = await app.request('/v1/auth/account/export', { headers: headers(user) });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
        releaseIdentities: Array<{
            fingerprint: string;
            supersededAt?: string;
            identity: ReleaseIdentity;
        }>;
    };
    assert.equal(body.releaseIdentities.length, 2);
    assert.ok(body.releaseIdentities.every((row) => row.identity.accountId === user.id));
    assert.equal(body.releaseIdentities.filter((row) => !row.supersededAt).length, 1);
    assert.ok(body.releaseIdentities.some((row) => row.identity.signature === first.signature));

    const selfService = await app.request('/v1/data-export', { headers: headers(user) });
    assert.equal(selfService.status, 200);
    const exported = (await selfService.json()) as { account: { releaseIdentities: unknown[] } };
    assert.equal(exported.account.releaseIdentities.length, 2);
});
