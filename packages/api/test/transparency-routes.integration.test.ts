import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { applySubscriptionWebhookEvent } = await import('../src/services/subscriptions');

function makeUser(username: string): { id: string; token: string } {
    const id = randomUUID();
    db.createUser({
        id,
        username,
        email: `${username}@test.local`,
        passwordHash: 'x',
        reputationScore: 0,
        reputationTier: 'member',
        pubkeyEd25519: '',
    });
    return { id, token: signJwt(id, username, 600) };
}

/** Activate canopy_pro → `enterprise` entitlement tier → transparency.auditExport. */
function makeAuditEntitledUser(username: string): { id: string; token: string } {
    const user = makeUser(username);
    applySubscriptionWebhookEvent({
        eventId: randomUUID(),
        type: 'invoice.paid',
        userId: user.id,
        planCode: 'canopy_pro_monthly',
    });
    return user;
}

const auth = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

test('GET /v1/transparency/me rejects unauthenticated callers', async () => {
    const res = await app.request('/v1/transparency/me');
    assert.equal(res.status, 401);
});

test('GET /v1/transparency/me returns a free-tier self-report', async () => {
    const user = makeUser(`free_${randomUUID().slice(0, 8)}`);
    const res = await app.request('/v1/transparency/me', auth(user.token));
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, any>;
    assert.equal(body.userId, user.id);
    assert.equal(body.entitlements.enabled, true);
    assert.equal(body.entitlements.selfReport, true);
    assert.equal(body.entitlements.warrantCanary, true);
    assert.equal(body.entitlements.auditExport, false);
    assert.equal(typeof body.counts.activeBurnerIdentities, 'number');
});

test('GET /v1/transparency/canary returns a dated statement with a stable sha256 digest', async () => {
    const user = makeUser(`canary_${randomUUID().slice(0, 8)}`);
    const res = await app.request('/v1/transparency/canary', auth(user.token));
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, any>;
    assert.equal(body.digestAlgorithm, 'sha256');
    assert.match(body.digest, /^[0-9a-f]{64}$/);
    assert.ok(typeof body.statement === 'string' && body.statement.length > 0);

    // Same period ⇒ identical digest (tamper-evidence anchor).
    const res2 = await app.request('/v1/transparency/canary', auth(user.token));
    const body2 = (await res2.json()) as Record<string, any>;
    assert.equal(body2.digest, body.digest);
});

test('GET /v1/transparency/audit-export returns 402 for an unentitled (free) caller', async () => {
    const user = makeUser(`noexport_${randomUUID().slice(0, 8)}`);
    const res = await app.request('/v1/transparency/audit-export', auth(user.token));
    assert.equal(res.status, 402);
    const body = (await res.json()) as Record<string, any>;
    assert.equal(body.code, 'audit_export_not_entitled');
    assert.equal(body.suggestedTier, 'team');
});

test('GET /v1/transparency/audit-export returns the export for an entitled caller', async () => {
    const user = makeAuditEntitledUser(`export_${randomUUID().slice(0, 8)}`);
    const res = await app.request('/v1/transparency/audit-export', auth(user.token));
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, any>;
    assert.equal(body.schema, 'blackout.transparency.audit-export.v1');
    assert.equal(body.userId, user.id);
    assert.equal(body.entitlements.auditExport, true);
    assert.ok(Array.isArray(body.burnerIdentities));
});
