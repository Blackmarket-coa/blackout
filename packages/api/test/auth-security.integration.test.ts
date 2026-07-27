import test from 'node:test';
import assert from 'node:assert/strict';

const loadAuth = async () => import('../src/services/auth');

const resetEnv = () => {
    delete process.env.JWT_SECRET;
    delete process.env.JWT_SECRET_PRIMARY;
    delete process.env.JWT_SECRET_ROLLOVER;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
    delete process.env.AUTH_TOKEN_TRANSPORT;
    delete process.env.AUTH_COOKIE_NAME;
    delete process.env.AUTH_COOKIE_SECURE;
    delete process.env.AUTH_COOKIE_SAMESITE;
    delete process.env.NODE_ENV;
};

test('rejects weak or missing jwt secret', async () => {
    resetEnv();
    const auth = await loadAuth();
    auth.clearAuthRuntimeConfigCache();

    assert.throws(() => auth.readAuthRuntimeConfig(), /JWT secret missing/);

    process.env.JWT_SECRET_PRIMARY = 'local-dev-secret';
    auth.clearAuthRuntimeConfigCache();
    assert.throws(() => auth.readAuthRuntimeConfig(), /weak/);
});

test('supports dual-key rollover verification', async () => {
    resetEnv();
    const auth = await loadAuth();

    process.env.JWT_SECRET_PRIMARY = 'N3w!PrimaryKey-That-Is-Strong-123#ABCxyzZZ';
    process.env.JWT_SECRET_ROLLOVER = 'Old!RolloverKey-That-Is-Strong-456#ABCxyzZZ';
    process.env.JWT_ISSUER = 'blackout-api';
    process.env.JWT_AUDIENCE = 'blackout-clients';
    auth.clearAuthRuntimeConfigCache();

    const oldToken = (() => {
        process.env.JWT_SECRET_PRIMARY = 'Old!RolloverKey-That-Is-Strong-456#ABCxyzZZ';
        process.env.JWT_SECRET_ROLLOVER = '';
        auth.clearAuthRuntimeConfigCache();
        return auth.signJwt('user-1', 'alice', 3600);
    })();

    process.env.JWT_SECRET_PRIMARY = 'N3w!PrimaryKey-That-Is-Strong-123#ABCxyzZZ';
    process.env.JWT_SECRET_ROLLOVER = 'Old!RolloverKey-That-Is-Strong-456#ABCxyzZZ';
    auth.clearAuthRuntimeConfigCache();

    const payload = auth.verifyJwt(oldToken);
    assert.ok(payload);
    assert.equal(payload?.sub, 'user-1');
});

test('validates secure cookie settings in production', async () => {
    resetEnv();
    const auth = await loadAuth();
    process.env.JWT_SECRET_PRIMARY = 'Str0ng!CookieKey-That-Is-Long-789#ABCxyzZZ';
    process.env.AUTH_TOKEN_TRANSPORT = 'cookie';
    process.env.AUTH_COOKIE_NAME = 'blackout_session';
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.NODE_ENV = 'production';
    auth.clearAuthRuntimeConfigCache();

    assert.throws(() => auth.readAuthRuntimeConfig(), /AUTH_COOKIE_SECURE must be true/);
});

test('verifyJwt pins the header algorithm to HS256 (L1 defense-in-depth)', async () => {
    resetEnv();
    const auth = await loadAuth();
    // Synthetic low-entropy test secret (repeated token) that still satisfies
    // isStrongSecret(): length >= 32 with lower/upper/digit/symbol classes. Kept
    // deliberately low-entropy so entropy-based secret scanners don't flag it.
    process.env.JWT_SECRET_PRIMARY = 'AlgTest1!'.repeat(4);
    process.env.JWT_ISSUER = 'blackout-api';
    process.env.JWT_AUDIENCE = 'blackout-clients';
    auth.clearAuthRuntimeConfigCache();

    // A correctly-signed HS256 token still verifies (regression).
    const good = auth.signJwt('user-alg', 'alice', 3600);
    assert.ok(auth.verifyJwt(good), 'valid HS256 token should verify');

    const b64url = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const payload = b64url({
        sub: 'attacker',
        username: 'x',
        iat: now,
        exp: now + 3600,
        iss: 'blackout-api',
        aud: 'blackout-clients',
    });

    // alg:"none" with no signature must be rejected before signature checks.
    const noneHeader = b64url({ alg: 'none', typ: 'JWT' });
    assert.equal(auth.verifyJwt(`${noneHeader}.${payload}.`), null, 'alg:none must be rejected');

    // A different HMAC alg in the header must also be rejected.
    const hs384Header = b64url({ alg: 'HS384', typ: 'JWT' });
    assert.equal(
        auth.verifyJwt(`${hs384Header}.${payload}.deadbeef`),
        null,
        'non-HS256 alg must be rejected'
    );
});
