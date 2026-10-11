/**
 * Password hashing on the request path must not hold the event loop.
 *
 * scrypt costs ~40 ms per call. Run synchronously (scryptSync) it stalls every
 * other in-flight request for that long: the nightly k6 auth flow saw token
 * refreshes, which do no hashing at all, wait ~0.6 s at p95 behind other
 * users' registrations (load/k6/auth.js, 25 VUs). /register and /login now
 * hash on the libuv threadpool. Because that await yields, the handlers also
 * have to re-validate what they read before it — covered here too.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET_PRIMARY = process.env.JWT_SECRET_PRIMARY ?? generateTestJwtSecret();
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.BLACKOUT_DB_MODE = 'memory';
delete process.env.REQUIRE_INVITE_TOKEN;

const { default: app } = await import('../src/index');
const { db } = await import('../src/db/store');
const auth = await import('../src/services/auth');

const PASSWORD = 'Original-Pass-1234!';
let seq = 0;
const freshName = () => `hashload${process.pid}x${++seq}${randomBytes(3).toString('hex')}`;

const post = (path: string, body: unknown) =>
    app.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
const register = (username: string, email = `${username}@example.com`) =>
    post('/v1/auth/register', { username, email, password: PASSWORD });
const login = (email: string, password = PASSWORD) => post('/v1/auth/login', { email, password });

/**
 * Longest gap between ticks of a 1 ms interval while `work` runs: the longest
 * stretch the event loop could not service anything else.
 */
const longestStall = async (work: () => Promise<unknown>): Promise<number> => {
    let last = performance.now();
    let longest = 0;
    const beat = setInterval(() => {
        const now = performance.now();
        longest = Math.max(longest, now - last);
        last = now;
    }, 1);
    try {
        await work();
    } finally {
        clearInterval(beat);
    }
    return Math.max(longest, performance.now() - last);
};

/** Cost of one synchronous scrypt with the parameters hashPassword uses. */
const oneSyncHashMs = (): number => {
    const salt = randomBytes(16).toString('hex');
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        scryptSync('calibration-password', salt, 64);
        best = Math.min(best, performance.now() - t0);
    }
    return best;
};

test('register and login leave the event loop free while scrypt runs', async (t) => {
    // Warm up so first-request work (lazy imports, JIT) is not in the window.
    const warm = freshName();
    assert.equal((await register(warm)).status, 201);
    assert.equal((await login(`${warm}@example.com`)).status, 200);

    const hashMs = oneSyncHashMs();
    const names = [freshName(), freshName()];
    const stall = await longestStall(async () => {
        const created = await Promise.all(names.map((n) => register(n)));
        assert.deepEqual(
            created.map((r) => r.status),
            [201, 201]
        );
        const signedIn = await Promise.all(names.map((n) => login(`${n}@example.com`)));
        assert.deepEqual(
            signedIn.map((r) => r.status),
            [200, 200]
        );
    });
    t.diagnostic(`longest stall ${stall.toFixed(1)} ms; one sync scrypt ${hashMs.toFixed(1)} ms`);
    // A hash run on the event loop stalls it for at least one full hash.
    assert.ok(
        stall < hashMs / 2,
        `event loop stalled ${stall.toFixed(1)} ms; one scrypt is ${hashMs.toFixed(1)} ms`
    );
});

test('concurrent registrations for one username: exactly one succeeds', async () => {
    const username = freshName();
    const results = await Promise.all([
        register(username, `${username}-a@example.com`),
        register(username, `${username}-b@example.com`),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
});

test('concurrent registrations for one email: exactly one succeeds', async () => {
    const email = `${freshName()}@example.com`;
    const results = await Promise.all([register(freshName(), email), register(freshName(), email)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
});

test('a password change landing mid-verify does not let the old password sign in', async () => {
    const username = freshName();
    const email = `${username}@example.com`;
    assert.equal((await register(username)).status, 201);
    // Control: the credentials are right, so a 401 below can only come from
    // the change, not from a wrong password.
    assert.equal((await login(email)).status, 200);

    const user = db.findUserByEmail(email)!;
    const lookup = db.findUserByEmail;
    // Change the password the moment the handler has read the account, i.e.
    // while its scrypt verify is in flight on the threadpool.
    db.findUserByEmail = (target: string) => {
        const found = lookup.call(db, target);
        if (found?.id === user.id) {
            setImmediate(() => db.updateUserPassword(user.id, auth.hashPassword('Changed-9876!')));
        }
        return found;
    };
    try {
        const res = await login(email);
        assert.equal(res.status, 401);
        const body = (await res.json()) as { code: string };
        assert.equal(body.code, 'invalid_credentials');
    } finally {
        db.findUserByEmail = lookup;
    }
});

test('async and sync password hashes are interchangeable', async () => {
    const fromSync = auth.hashPassword(PASSWORD);
    const fromAsync = await auth.hashPasswordAsync(PASSWORD);
    assert.match(fromAsync, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
    assert.equal(await auth.verifyPasswordAsync(PASSWORD, fromSync), true);
    assert.equal(auth.verifyPassword(PASSWORD, fromAsync), true);
    assert.equal(await auth.verifyPasswordAsync('wrong-password', fromSync), false);
    assert.equal(await auth.verifyPasswordConstantTimeAsync(PASSWORD, fromAsync), true);
    assert.equal(await auth.verifyPasswordConstantTimeAsync(PASSWORD, undefined), false);
});
