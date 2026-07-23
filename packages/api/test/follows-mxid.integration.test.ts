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

const seedUser = (overrides: Partial<{ id: string; username: string }> = {}) => {
    const id = overrides.id ?? randomUUID();
    const username = overrides.username ?? `user-${id.slice(0, 8)}`;
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

const bearer = (userId: string, username: string) => ({
    authorization: `Bearer ${signJwt(userId, username, 600)}`,
    'content-type': 'application/json',
});

test('follows: POST accepts a Matrix id and resolves it by localpart', async () => {
    const follower = seedUser();
    const followee = seedUser();

    // The profile surface only knows the target's Matrix id; the localpart is
    // the Blackout username, whatever the homeserver domain.
    const follow = await app.request('/v1/follows', {
        method: 'POST',
        headers: bearer(follower.id, follower.username),
        body: JSON.stringify({ followeeId: `@${followee.username}:any.domain.example` }),
    });
    assert.equal(follow.status, 201);

    const list = await app.request('/v1/follows/following', {
        headers: bearer(follower.id, follower.username),
    });
    assert.equal(list.status, 200);
    const body = (await list.json()) as { following: { userId: string }[] };
    assert.deepEqual(
        body.following.map((f) => f.userId),
        [followee.id]
    );
});

test('follows: POST with an unknown Matrix localpart still 404s', async () => {
    const follower = seedUser();
    const res = await app.request('/v1/follows', {
        method: 'POST',
        headers: bearer(follower.id, follower.username),
        body: JSON.stringify({ followeeId: '@no-such-user:any.domain.example' }),
    });
    assert.equal(res.status, 404);
});

test('follows: POST with a plain Blackout id is unchanged', async () => {
    const follower = seedUser();
    const followee = seedUser();
    const res = await app.request('/v1/follows', {
        method: 'POST',
        headers: bearer(follower.id, follower.username),
        body: JSON.stringify({ followeeId: followee.id }),
    });
    assert.equal(res.status, 201);
});
