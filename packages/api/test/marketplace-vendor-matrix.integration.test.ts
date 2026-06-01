import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.MATRIX_HOMESERVER_DOMAIN = process.env.MATRIX_HOMESERVER_DOMAIN ?? 'blackout.local';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');

function ensureUser(id: string): void {
    if (db.getUserById(id)) return;
    db.createUser({
        id,
        username: id,
        email: `${id}@blackout.test`,
        passwordHash: 'test-hash',
        reputationScore: 100,
        reputationTier: 'member',
        pubkeyEd25519: `${id}-pubkey`,
    });
}

function authHeaders(id: string): Record<string, string> {
    ensureUser(id);
    return {
        authorization: `Bearer ${signJwt(id, id, 600)}`,
        'content-type': 'application/json',
    };
}

test('GET /v1/marketplace/vendors/:vendorId/matrix resolves a known vendor to an MXID', async () => {
    ensureUser('vendor-acme');
    const res = await app.request('/v1/marketplace/vendors/vendor-acme/matrix', {
        method: 'GET',
        headers: authHeaders('buyer-1'),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { vendorId: string; mxid: string | null };
    assert.equal(body.vendorId, 'vendor-acme');
    assert.equal(body.mxid, '@vendor-acme:blackout.local');
});

test('returns mxid:null for a vendor that cannot be addressed', async () => {
    const res = await app.request('/v1/marketplace/vendors/ghost-vendor/matrix', {
        method: 'GET',
        headers: authHeaders('buyer-1'),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { vendorId: string; mxid: string | null };
    assert.equal(body.mxid, null);
});

test('passes through a value that is already an MXID', async () => {
    const mxid = '@already:matrix.example';
    const res = await app.request(
        `/v1/marketplace/vendors/${encodeURIComponent(mxid)}/matrix`,
        { method: 'GET', headers: authHeaders('buyer-1') }
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { mxid: string | null };
    assert.equal(body.mxid, mxid);
});

test('requires authentication', async () => {
    const res = await app.request('/v1/marketplace/vendors/vendor-acme/matrix', {
        method: 'GET',
    });
    assert.equal(res.status, 401);
});
