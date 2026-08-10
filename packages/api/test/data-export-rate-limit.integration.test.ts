// The export endpoint is the most expensive read a signed-in user can trigger —
// each call scans every user-scoped table and builds the payload in memory. The
// pre-existing `GET /v1/auth/account/export` shipped with no bucket of its own
// (the account *deletion* routes got `authRateLimit`, the export did not), so
// this pins that the new surface does not repeat that.
//
// Lives in its own file because the limiter reads its ceiling from the
// environment at module load, and the main suite needs a high one.

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.EXPORT_RATE_LIMIT_MAX = '2';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');

const seed = (username: string): string => {
    const id = randomUUID();
    db.createUser({
        id,
        username,
        email: `${username}@example.test`,
        passwordHash: 'x',
        reputationScore: 1,
        reputationTier: 'member',
        pubkeyEd25519: `pk-${username}`,
    });
    return id;
};

const ALICE = seed('rl-alice');
const BOB = seed('rl-bob');

const call = (userId: string, username: string) =>
    app.request('/v1/data-export', {
        headers: { authorization: `Bearer ${signJwt(userId, username, 600)}` },
    });

test('a user exceeding their export budget gets 429', async () => {
    assert.equal((await call(ALICE, 'rl-alice')).status, 200);
    assert.equal((await call(ALICE, 'rl-alice')).status, 200);

    const limited = await call(ALICE, 'rl-alice');
    assert.equal(limited.status, 429);
    assert.equal(((await limited.json()) as { code: string }).code, 'rate_limited');
    assert.ok(limited.headers.get('retry-after'), 'tells the caller when to come back');
});

test('the budget is per user, not per IP', async () => {
    // Users behind one NAT — a shared office, a Tor exit, a mobile carrier —
    // must not be able to exhaust each other's ability to retrieve their data.
    // Alice is already over her limit from the previous test.
    assert.equal((await call(ALICE, 'rl-alice')).status, 429);
    assert.equal(
        (await call(BOB, 'rl-bob')).status,
        200,
        "one user's exports must not consume another's budget"
    );
});
