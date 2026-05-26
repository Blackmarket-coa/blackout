import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');

function authHeader(user: string): Record<string, string> {
    return { authorization: `Bearer ${signJwt(user, 'coalition', 600)}`, 'content-type': 'application/json' };
}

function seedUser(tier: 'member' | 'coordinator'): string {
    const id = randomUUID();
    db.createUser({
        id,
        username: `u_${id.slice(0, 8)}`,
        email: `${id.slice(0, 8)}@example.test`,
        passwordHash: 'hash',
        reputationScore: 1,
        reputationTier: tier,
        pubkeyEd25519: 'pk',
    });
    return id;
}

test('GET /kits lists the preconfigured packs', async () => {
    const res = await app.request('/v1/coalition/kits', { headers: authHeader('viewer') });
    assert.equal(res.status, 200);
    const { kits } = (await res.json()) as { kits: Array<{ id: string; enabledTabs: string[] }> };
    const ids = kits.map((k) => k.id);
    assert.ok(ids.includes('mutual-aid') && ids.includes('market') && ids.includes('activist'));
    const mutualAid = kits.find((k) => k.id === 'mutual-aid');
    assert.ok(mutualAid?.enabledTabs.includes('events'));
});

test('applying a kit requires coordinator/arbiter at a den scope', async () => {
    const memberId = seedUser('member');
    const res = await app.request('/v1/coalition/kits/mutual-aid/apply', {
        method: 'POST',
        headers: authHeader(memberId),
        body: JSON.stringify({ scopeType: 'den', scopeId: '!den-x:server' }),
    });
    assert.equal(res.status, 403);
});

test('a coordinator applies a kit: installs plugins, records the application', async () => {
    const coordId = seedUser('coordinator');
    const denId = `!den-${randomUUID().slice(0, 8)}:server`;
    const res = await app.request('/v1/coalition/kits/mutual-aid/apply', {
        method: 'POST',
        headers: authHeader(coordId),
        body: JSON.stringify({ scopeType: 'den', scopeId: denId }),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as {
        enabledTabs: string[];
        installations: Array<{ pluginId: string; scope: { id: string } }>;
        application: { kitId: string; scopeId: string };
    };
    assert.deepEqual(body.enabledTabs, ['chat', 'map', 'events', 'tasks']);
    assert.ok(body.installations.some((i) => i.pluginId === 'coalition.mutual-aid-board'));
    assert.ok(body.installations.every((i) => i.scope.id === denId));
    assert.equal(body.application.kitId, 'mutual-aid');

    // the application is queryable for the scope
    const applied = await app.request(
        `/v1/coalition/kits/applied?scopeType=den&scopeId=${encodeURIComponent(denId)}`,
        { headers: authHeader(coordId) },
    );
    const { applications } = (await applied.json()) as {
        applications: Array<{ kitId: string }>;
    };
    assert.ok(applications.some((a) => a.kitId === 'mutual-aid'));
});

test('unknown kit id returns 404', async () => {
    const coordId = seedUser('coordinator');
    const res = await app.request('/v1/coalition/kits/nope/apply', {
        method: 'POST',
        headers: authHeader(coordId),
        body: JSON.stringify({ scopeType: 'den', scopeId: '!d:server' }),
    });
    assert.equal(res.status, 404);
});
