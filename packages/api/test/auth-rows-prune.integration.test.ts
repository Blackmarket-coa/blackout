/**
 * The expired-auth-rows prune (`services/authRowsPruneScheduler.ts`). The
 * store's `pruneExpiredRevokedSessions`, `prunePendingOAuthLinks` and
 * `prunePendingOidcLogins` had no caller until 2026-10-25 (D2 in
 * docs/black-mask-account-link-design.md §7), so expired denylist entries and
 * pending OAuth / OIDC state were kept forever.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = 'memory';

const { db } = await import('../src/db/store');
const {
    isAuthRowsPruneSchedulerRunning,
    runAuthRowsPrune,
    startAuthRowsPruneScheduler,
    stopAuthRowsPruneScheduler,
} = await import('../src/services/authRowsPruneScheduler');

const iso = (offsetMs: number, from = Date.now()) => new Date(from + offsetMs).toISOString();

const seedRows = () => {
    const userId = randomUUID();
    const expiredJti = `expired-${randomUUID()}`;
    const liveJti = `live-${randomUUID()}`;
    db.revokeSession({ jti: expiredJti, userId, reason: 'test', expiresAt: iso(-60_000) });
    db.revokeSession({ jti: liveJti, userId, reason: 'test', expiresAt: iso(60 * 60_000) });

    const expiredState = `oauth-expired-${randomUUID()}`;
    const liveState = `oauth-live-${randomUUID()}`;
    for (const [stateHash, expiresAt] of [
        [expiredState, iso(-60_000)],
        [liveState, iso(60 * 60_000)],
    ] as const) {
        db.createPendingOAuthLink({
            stateHash,
            blackoutUserId: userId,
            provider: 'twitch',
            codeVerifierCiphertext: 'enc',
            redirectUri: 'https://app.example/cb',
            scopes: [],
            encryptionKeyId: 'k1',
            expiresAt,
        });
    }

    const expiredOidc = `oidc-expired-${randomUUID()}`;
    const liveOidc = `oidc-live-${randomUUID()}`;
    for (const [stateHash, expiresAt] of [
        [expiredOidc, iso(-60_000)],
        [liveOidc, iso(60 * 60_000)],
    ] as const) {
        db.createPendingOidcLogin({
            stateHash,
            codeVerifierCiphertext: 'enc',
            nonceHash: 'n',
            redirectUri: 'https://app.example/cb',
            encryptionKeyId: 'k1',
            expiresAt,
        } as Parameters<typeof db.createPendingOidcLogin>[0]);
    }

    return { expiredJti, liveJti, expiredState, liveState, expiredOidc, liveOidc };
};

test('one pass removes exactly the expired rows from all three tables and keeps the live ones', () => {
    const rows = seedRows();
    const before = {
        revoked: db.revokedSessions.size,
        oauth: db.pendingOAuthLinks.size,
        oidc: db.pendingOidcLogins.size,
    };

    const result = runAuthRowsPrune(new Date());

    assert.equal(result.revokedSessions, 1);
    assert.equal(result.pendingOAuthLinks, 1);
    assert.equal(result.pendingOidcLogins, 1);
    assert.equal(db.revokedSessions.size, before.revoked - 1);
    assert.equal(db.pendingOAuthLinks.size, before.oauth - 1);
    assert.equal(db.pendingOidcLogins.size, before.oidc - 1);

    assert.equal(db.revokedSessions.has(rows.expiredJti), false);
    assert.equal(db.revokedSessions.has(rows.liveJti), true);
    assert.equal(db.isSessionRevoked(rows.liveJti), true, 'a live revocation still bites');
    assert.equal(db.pendingOAuthLinks.has(rows.expiredState), false);
    assert.equal(db.pendingOAuthLinks.has(rows.liveState), true);
    assert.equal(db.pendingOidcLogins.has(rows.expiredOidc), false);
    assert.equal(db.pendingOidcLogins.has(rows.liveOidc), true);

    // Nothing left to do: a second pass at the same instant removes nothing.
    assert.deepEqual(runAuthRowsPrune(new Date()), {
        revokedSessions: 0,
        pendingOAuthLinks: 0,
        pendingOidcLogins: 0,
    });
});

test('the per-user "logout everywhere" cutoff is pruned once it can no longer matter', () => {
    const userId = randomUUID();
    db.revokeUserTokensBefore(userId, 'test');
    assert.ok(db.getUserTokenRevocationCutoff(userId) > 0);
    // Its own TTL (the max access-token lifetime) has to pass first.
    assert.equal(runAuthRowsPrune(new Date()).revokedSessions, 0);
    assert.ok(db.getUserTokenRevocationCutoff(userId) > 0);

    // Rows other tests left behind expire by then too, so count this user's own.
    const rowsFor = () => [...db.revokedSessions.values()].filter((r) => r.userId === userId);
    assert.equal(rowsFor().length, 1);
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60_000);
    assert.ok(runAuthRowsPrune(farFuture).revokedSessions >= 1);
    assert.equal(rowsFor().length, 0, 'the cutoff row is gone');
});

test('the scheduler starts idempotently, runs a first pass right away, and stops', async () => {
    const rows = seedRows();
    assert.equal(isAuthRowsPruneSchedulerRunning(), false);
    const first = startAuthRowsPruneScheduler(60_000);
    const second = startAuthRowsPruneScheduler(60_000);
    assert.equal(isAuthRowsPruneSchedulerRunning(), true);
    assert.equal(first.stop, second.stop);

    // The first pass is a macrotask away.
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(db.revokedSessions.has(rows.expiredJti), false, 'pruned on the first pass');
    assert.equal(db.revokedSessions.has(rows.liveJti), true);

    stopAuthRowsPruneScheduler();
    assert.equal(isAuthRowsPruneSchedulerRunning(), false);
    first.stop();
    assert.equal(isAuthRowsPruneSchedulerRunning(), false);
});
