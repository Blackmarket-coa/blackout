/**
 * The key-transparency routes. `POST /append` used to take no session and any
 * `userId`, so anyone could publish a key under anyone's name — into the log a
 * client is meant to check its own key against
 * (docs/security/api-findings-triage-2026-10-25.md, finding 1). It now needs a
 * session and an entry for the caller's own account only. `/verify-sth` says
 * whether a witness signature verified, separately from well-formedness.
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
delete process.env.KT_WITNESS_ED25519_SEED;
delete process.env.KT_LOG_FILE;

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');

const seedUser = () => {
    const id = randomUUID();
    const username = `kt-${id.slice(0, 8)}`;
    db.createUser({
        id,
        username,
        email: `${username}@example.com`,
        passwordHash: 'unused',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: 'pk',
    });
    return { id, username, mxid: `@${username}:test.local` };
};

const auth = (user: { id: string; username: string }) => ({
    authorization: `Bearer ${signJwt(user.id, user.username, 600)}`,
});

const append = (body: Record<string, unknown>, headers: Record<string, string>) =>
    app.request('/v1/key-transparency/append', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });

const treeSize = async (): Promise<number> => {
    const res = await app.request('/v1/key-transparency/root');
    return ((await res.json()) as { treeSize: number }).treeSize;
};

const entriesFor = async (userId: string) => {
    const res = await app.request(`/v1/key-transparency/lookup/${encodeURIComponent(userId)}`);
    return ((await res.json()) as { entries: { entry: { userId: string; masterKey: string } }[] })
        .entries;
};

test('append without a session is refused and appends nothing', async () => {
    const alice = seedUser();
    const before = await treeSize();
    const res = await append({ userId: alice.mxid, masterKey: 'mk-anon' }, {});
    assert.equal(res.status, 401);
    assert.equal(await treeSize(), before);
    assert.equal((await entriesFor(alice.mxid)).length, 0);
});

test('append for another account, by Matrix id or Blackout id, is refused and appends nothing', async () => {
    const alice = seedUser();
    const bob = seedUser();
    const before = await treeSize();
    for (const userId of [bob.mxid, bob.id]) {
        const res = await append({ userId, masterKey: 'mk-planted' }, auth(alice));
        assert.equal(res.status, 403, `alice publishing for ${userId}`);
        assert.equal(((await res.json()) as { code: string }).code, 'user_mismatch');
    }
    assert.equal(await treeSize(), before);
    assert.equal((await entriesFor(bob.mxid)).length, 0);
    assert.equal((await entriesFor(bob.id)).length, 0);
});

test('append for the caller’s own username on another homeserver is refused', async () => {
    const alice = seedUser();
    const before = await treeSize();
    const res = await append(
        { userId: `@${alice.username}:elsewhere.example`, masterKey: 'mk-foreign' },
        auth(alice)
    );
    assert.equal(res.status, 403);
    assert.equal(await treeSize(), before);
});

test('append for the caller’s own account works by Matrix id, by Blackout id, and by default', async () => {
    const alice = seedUser();
    const before = await treeSize();

    const byMxid = await append({ userId: alice.mxid, masterKey: 'mk-1' }, auth(alice));
    assert.equal(byMxid.status, 200);
    const first = (await byMxid.json()) as { leafIndex: number; root: { treeSize: number } };
    assert.equal(first.leafIndex, before);
    assert.equal(first.root.treeSize, before + 1);

    const byId = await append({ userId: alice.id, masterKey: 'mk-2' }, auth(alice));
    assert.equal(byId.status, 200);

    // No userId: the caller's Matrix id, which is what a client would look up.
    const implicit = await append({ masterKey: 'mk-3' }, auth(alice));
    assert.equal(implicit.status, 200);

    assert.equal(await treeSize(), before + 3);
    const mine = await entriesFor(alice.mxid);
    assert.deepEqual(
        mine.map((e) => e.entry.masterKey),
        ['mk-1', 'mk-3']
    );
    assert.equal((await entriesFor(alice.id)).length, 1);
});

test('a leaf appended through the route carries an inclusion proof that verifies', async () => {
    const alice = seedUser();
    const res = await append({ masterKey: 'mk-proof' }, auth(alice));
    const { leafIndex } = (await res.json()) as { leafIndex: number };
    const proof = await (await app.request(`/v1/key-transparency/inclusion/${leafIndex}`)).json();
    const root = await (await app.request('/v1/key-transparency/root')).json();
    const verify = await app.request('/v1/key-transparency/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proof, expectedRoot: root }),
    });
    assert.deepEqual(await verify.json(), { ok: true });
});

test('without a witness seed the STH is explicitly unsigned, and verify-sth says so', async () => {
    const sth = (await (await app.request('/v1/key-transparency/sth')).json()) as {
        scheme: string;
        signature: string;
        witnessKey: string;
    };
    assert.equal(sth.scheme, 'none');
    assert.equal(sth.signature, '');
    assert.equal(sth.witnessKey, '');

    const verify = await app.request('/v1/key-transparency/verify-sth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sth }),
    });
    assert.deepEqual(await verify.json(), { ok: true, signed: false });
});
