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
