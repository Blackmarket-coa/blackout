import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { generateTestJwtSecret } from './_fixtures/secrets';

process.env.JWT_SECRET_PRIMARY = generateTestJwtSecret();
process.env.JWT_ISSUER = 'blackout-api';
process.env.JWT_AUDIENCE = 'blackout-clients';
process.env.NODE_ENV = 'test';
process.env.BLACKOUT_DB_MODE = 'memory';

const loadModules = async () => {
  const auth = await import('../src/services/auth');
  const refreshToken = await import('../src/services/refreshToken');
  const passwordReset = await import('../src/services/passwordReset');
  const store = await import('../src/db/store');
  return { auth, refreshToken, passwordReset, db: store.db };
};

const seedUser = async (db: Awaited<ReturnType<typeof loadModules>>['db']) => {
  const auth = await import('../src/services/auth');
  const id = randomUUID();
  db.createUser({
    id,
    username: `alice-${id.slice(0, 4)}`,
    email: `alice-${id.slice(0, 4)}@example.com`,
    passwordHash: auth.hashPassword('Original-Pass-1234!'),
    reputationScore: 0,
    reputationTier: 'member',
    pubkeyEd25519: 'pk',
  });
  return db.getUserById(id)!;
};

test('signJwtWithMeta returns jti and exp', async () => {
  const { auth } = await loadModules();
  auth.clearAuthRuntimeConfigCache();
  const signed = auth.signJwtWithMeta('user-1', 'alice', 60);
  assert.ok(signed.jti.length > 10);
  assert.ok(signed.exp > Math.floor(Date.now() / 1000));
  const payload = auth.verifyJwt(signed.token);
  assert.equal(payload?.jti, signed.jti);
  assert.equal(payload?.sub, 'user-1');
});

test('refresh-token rotation rotates and invalidates the old token', async () => {
  const { refreshToken, db } = await loadModules();
  const user = await seedUser(db);

  const issued = refreshToken.issueRefreshToken({ userId: user.id });
  const rotated = refreshToken.rotateRefreshToken(issued.token);
  assert.equal(rotated.kind, 'ok');

  // Re-rotating the original (now-replaced) token must be detected as reuse.
  const reuse = refreshToken.rotateRefreshToken(issued.token);
  assert.equal(reuse.kind, 'reuse_detected');

  // After reuse detection, the entire family is revoked — even the rotated
  // token can no longer be refreshed.
  if (rotated.kind === 'ok') {
    const afterFamilyRevoke = refreshToken.rotateRefreshToken(rotated.rotated.token);
    assert.equal(afterFamilyRevoke.kind, 'revoked');
  }
});

test('refresh-token rotation rejects invalid and expired tokens', async () => {
  const { refreshToken, db } = await loadModules();
  const user = await seedUser(db);

  assert.equal(refreshToken.rotateRefreshToken('garbage-not-a-token').kind, 'invalid');

  const issued = refreshToken.issueRefreshToken({ userId: user.id });
  // Forcibly expire the token.
  const stored = db.findRefreshTokenByHash(refreshToken.__test__.sha256(issued.token));
  assert.ok(stored);
  db.refreshTokens.set(stored!.id, { ...stored!, expiresAt: new Date(Date.now() - 1000).toISOString() });

  assert.equal(refreshToken.rotateRefreshToken(issued.token).kind, 'expired');
});

test('password reset issues a token, mails it, and consumes once', async () => {
  const { passwordReset, refreshToken, db, auth } = await loadModules();
  auth.clearAuthRuntimeConfigCache();
  const user = await seedUser(db);

  // Issue an outstanding refresh token that should be invalidated by the reset.
  const refresh = refreshToken.issueRefreshToken({ userId: user.id });

  const issued = passwordReset.issuePasswordResetToken({ email: user.email });
  assert.ok(issued);
  assert.equal(issued!.user.id, user.id);

  const result = passwordReset.consumePasswordResetToken(issued!.token, 'BrandNewPass-9876!');
  assert.equal(result.kind, 'ok');

  // Token cannot be used twice.
  const replay = passwordReset.consumePasswordResetToken(issued!.token, 'BrandNewPass-9876!');
  assert.equal(replay.kind, 'consumed');

  // The user's password actually changed.
  const updatedUser = db.getUserById(user.id)!;
  assert.ok(auth.verifyPassword('BrandNewPass-9876!', updatedUser.passwordHash));
  assert.equal(auth.verifyPassword('Original-Pass-1234!', updatedUser.passwordHash), false);

  // The outstanding refresh token is now revoked.
  const rotateAttempt = refreshToken.rotateRefreshToken(refresh.token);
  assert.equal(rotateAttempt.kind, 'revoked');
});

test('password reset rejects expired and weak passwords', async () => {
  const { passwordReset, db } = await loadModules();
  const user = await seedUser(db);

  // Unknown email returns null — the route turns this into a 202 to avoid
  // enumeration; the service simply returns null.
  assert.equal(passwordReset.issuePasswordResetToken({ email: 'nobody@example.com' }), null);

  const issued = passwordReset.issuePasswordResetToken({ email: user.email })!;
  assert.equal(passwordReset.consumePasswordResetToken(issued.token, 'short').kind, 'weak_password');

  // Force expiry.
  const stored = db.findPasswordResetTokenByHash(passwordReset.__test__.sha256(issued.token));
  db.passwordResetTokens.set(stored!.id, {
    ...stored!,
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  });
  assert.equal(passwordReset.consumePasswordResetToken(issued.token, 'StrongPass-12345!').kind, 'expired');
});

test('revokeSession denylist blocks reuse of a still-valid jwt', async () => {
  const { auth, db } = await loadModules();
  auth.clearAuthRuntimeConfigCache();
  const signed = auth.signJwtWithMeta('user-revoke-1', 'alice', 60);

  // Initially the token verifies and is not denylisted.
  assert.ok(auth.verifyJwt(signed.token));
  assert.equal(db.isSessionRevoked(signed.jti), false);

  db.revokeSession({
    jti: signed.jti,
    userId: 'user-revoke-1',
    expiresAt: new Date(signed.exp * 1000).toISOString(),
    reason: 'logout',
  });

  // Token still cryptographically verifies (we don't rotate signing keys);
  // the denylist is what the auth middleware consults.
  assert.equal(db.isSessionRevoked(signed.jti), true);
});
