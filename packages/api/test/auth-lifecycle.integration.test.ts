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
    db.refreshTokens.set(stored!.id, {
        ...stored!,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

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
    assert.equal(
        passwordReset.consumePasswordResetToken(issued.token, 'short').kind,
        'weak_password'
    );

    // Force expiry.
    const stored = db.findPasswordResetTokenByHash(passwordReset.__test__.sha256(issued.token));
    db.passwordResetTokens.set(stored!.id, {
        ...stored!,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    assert.equal(
        passwordReset.consumePasswordResetToken(issued.token, 'StrongPass-12345!').kind,
        'expired'
    );
});

test('ResendMailer retries transient errors and surfaces permanent ones', async () => {
    const mailer = await import('../src/services/mailer');
    let attempts = 0;
    const transientThenOk = new mailer.ResendMailer({
        apiKey: 'test',
        from: 'noreply@blackout.local',
        backoffMs: 1,
        fetchImpl: async () => {
            attempts += 1;
            if (attempts < 3) {
                return new Response('upstream', { status: 503 });
            }
            return new Response('{"id":"ok"}', { status: 200 });
        },
    });
    await transientThenOk.send({ to: 'a@b.test', subject: 's', text: 't', kind: 'unit_test' });
    assert.equal(attempts, 3);

    let permAttempts = 0;
    const permanent = new mailer.ResendMailer({
        apiKey: 'test',
        from: 'noreply@blackout.local',
        backoffMs: 1,
        fetchImpl: async () => {
            permAttempts += 1;
            return new Response('bad request', { status: 400 });
        },
    });
    await assert.rejects(permanent.send({ to: 'a@b.test', subject: 's', text: 't' }));
    assert.equal(permAttempts, 1);
});

test('account export returns user-scoped records and strips the password hash', async () => {
    const { db } = await loadModules();
    const lifecycle = await import('../src/services/accountLifecycle');
    const user = await seedUser(db);

    const exported = lifecycle.exportUserData(user.id);
    assert.ok(exported);
    assert.equal(exported!.user.id, user.id);
    // passwordHash must not leak.
    assert.equal((exported!.user as Record<string, unknown>).passwordHash, undefined);
    assert.equal(exported!.schemaVersion, 1);
    assert.ok(Array.isArray(exported!.linkedAccounts));
    assert.ok(Array.isArray(exported!.messages));
});

test('account deletion confirms and purges user + tokens; rejects cross-user', async () => {
    const { db, refreshToken } = await loadModules();
    const lifecycle = await import('../src/services/accountLifecycle');
    const userA = await seedUser(db);
    const userB = await seedUser(db);

    // Issue a refresh token on userA so we can verify it's purged.
    const refresh = refreshToken.issueRefreshToken({ userId: userA.id });
    assert.ok(db.findRefreshTokenByHash(refreshToken.__test__.sha256(refresh.token)));

    const issued = lifecycle.requestAccountDeletion({ userId: userA.id });
    assert.ok(issued);

    // Cross-user token use is rejected.
    assert.equal(lifecycle.confirmAccountDeletion(issued!.token, userB.id).kind, 'user_mismatch');

    // Correct user succeeds.
    const ok = lifecycle.confirmAccountDeletion(issued!.token, userA.id);
    assert.equal(ok.kind, 'ok');

    // The user record is gone.
    assert.equal(db.getUserById(userA.id), undefined);
    // Refresh tokens for the deleted user are gone.
    assert.equal(db.findRefreshTokenByHash(refreshToken.__test__.sha256(refresh.token)), undefined);

    // Replay is rejected — the token is purged along with the user's other auth
    // artifacts during deletion, so the second lookup returns 'invalid'. Either
    // 'invalid' or 'consumed' is acceptable here; the security property is that
    // a successful deletion cannot be replayed.
    const replay = lifecycle.confirmAccountDeletion(issued!.token, userA.id);
    assert.ok(
        replay.kind === 'invalid' || replay.kind === 'consumed',
        `unexpected replay outcome: ${replay.kind}`
    );
});

test('account deletion rejects expired tokens', async () => {
    const { db } = await loadModules();
    const lifecycle = await import('../src/services/accountLifecycle');
    const user = await seedUser(db);
    const issued = lifecycle.requestAccountDeletion({ userId: user.id });
    assert.ok(issued);

    const stored = db.findAccountDeletionTokenByHash(lifecycle.__test__.sha256(issued!.token));
    db.accountDeletionTokens.set(stored!.id, {
        ...stored!,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    assert.equal(lifecycle.confirmAccountDeletion(issued!.token, user.id).kind, 'expired');
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

test('revoke-all cutoff invalidates access tokens minted before it (H9)', async () => {
    const { auth, db } = await loadModules();
    auth.clearAuthRuntimeConfigCache();
    const { default: app } = await import('../src/index');
    const userId = `user-cutoff-${randomUUID().slice(0, 8)}`;

    const signed = auth.signJwtWithMeta(userId, 'alice', 3600);
    const payload = auth.verifyJwt(signed.token)!;

    // No cutoff yet: the token passes the auth middleware (200 from an
    // auth-only endpoint).
    const before = await app.request('/v1/coalition/notifications', {
        headers: { authorization: `Bearer ${signed.token}` },
    });
    assert.equal(before.status, 200);
    assert.equal(db.getUserTokenRevocationCutoff(userId), 0);

    // Simulate a revoke-all whose cutoff is just after this token's iat.
    db.revokedSessions.set(`user-token-cutoff:${userId}`, {
        jti: `user-token-cutoff:${userId}`,
        userId,
        revokedAt: new Date((payload.iat + 1) * 1000).toISOString(),
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        reason: 'admin_revoke',
    });

    // The same still-cryptographically-valid token is now rejected.
    const after = await app.request('/v1/coalition/notifications', {
        headers: { authorization: `Bearer ${signed.token}` },
    });
    assert.equal(after.status, 401);
    assert.equal(((await after.json()) as { code: string }).code, 'session_revoked');

    // A token minted after the cutoff is accepted again.
    const fresh = auth.signJwtWithMeta(userId, 'alice', 3600);
    // Force the cutoff into the past relative to the fresh token to avoid the
    // same-second boundary in fast test runs.
    db.revokedSessions.set(`user-token-cutoff:${userId}`, {
        jti: `user-token-cutoff:${userId}`,
        userId,
        revokedAt: new Date((auth.verifyJwt(fresh.token)!.iat - 1) * 1000).toISOString(),
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        reason: 'admin_revoke',
    });
    const refreshed = await app.request('/v1/coalition/notifications', {
        headers: { authorization: `Bearer ${fresh.token}` },
    });
    assert.equal(refreshed.status, 200);
});
