import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { __resetGovernanceStoreForTests } = await import('../src/services/governanceStore');

function authHeaders(capabilities = ['governance.read', 'governance.write']) {
    return {
        authorization: `Bearer ${signJwt('treasury-user', 'treasury', 600)}`,
        'content-type': 'application/json',
        'x-blackout-capabilities': capabilities.join(','),
    };
}

const sampleSnapshot = (id: string, generatedAt: string) => ({
    snapshotId: id,
    generatedAt,
    lines: [
        { asset: 'USDC', balance: '12345.67', delta24h: '+12.50' },
        { asset: 'BTC', balance: '0.5125' },
    ],
    totalReference: { currency: 'USD', amount: '50000.00' },
});

test('treasury snapshot returns 404 before publishing', async () => {
    __resetGovernanceStoreForTests();
    const response = await app.request('/v1/governance/treasury/snapshot', {
        headers: authHeaders(),
    });
    assert.equal(response.status, 404);
});

test('publish → latest → list newest first', async () => {
    __resetGovernanceStoreForTests();
    const headers = authHeaders();

    const earlier = await app.request('/v1/governance/treasury/snapshot', {
        method: 'POST',
        headers,
        body: JSON.stringify(sampleSnapshot('snap-old', '2026-01-01T00:00:00.000Z')),
    });
    assert.equal(earlier.status, 201);

    const later = await app.request('/v1/governance/treasury/snapshot', {
        method: 'POST',
        headers,
        body: JSON.stringify(sampleSnapshot('snap-new', '2026-05-01T00:00:00.000Z')),
    });
    assert.equal(later.status, 201);

    const latest = await app.request('/v1/governance/treasury/snapshot', { headers });
    assert.equal(latest.status, 200);
    const latestBody = (await latest.json()) as { snapshotId: string };
    assert.equal(latestBody.snapshotId, 'snap-new');

    const list = await app.request('/v1/governance/treasury/snapshots', { headers });
    const listBody = (await list.json()) as { items: Array<{ snapshotId: string }> };
    assert.deepEqual(
        listBody.items.map((entry) => entry.snapshotId),
        ['snap-new', 'snap-old'],
    );
});

test('treasury list paginates with cursor + limit', async () => {
    __resetGovernanceStoreForTests();
    const headers = authHeaders();
    const days = ['2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04', '2026-04-05'];
    for (const day of days) {
        await app.request('/v1/governance/treasury/snapshot', {
            method: 'POST',
            headers,
            body: JSON.stringify(sampleSnapshot(`snap-${day}`, `${day}T00:00:00.000Z`)),
        });
    }

    const page1 = await app.request('/v1/governance/treasury/snapshots?limit=2', { headers });
    const page1Body = (await page1.json()) as {
        items: Array<{ snapshotId: string }>;
        nextCursor?: string;
    };
    assert.equal(page1Body.items.length, 2);
    assert.equal(page1Body.items[0]!.snapshotId, 'snap-2026-04-05');
    assert.ok(page1Body.nextCursor);

    const page2 = await app.request(
        `/v1/governance/treasury/snapshots?limit=2&cursor=${encodeURIComponent(page1Body.nextCursor!)}`,
        { headers },
    );
    const page2Body = (await page2.json()) as {
        items: Array<{ snapshotId: string }>;
        nextCursor?: string;
    };
    assert.equal(page2Body.items.length, 2);
    assert.equal(page2Body.items[0]!.snapshotId, 'snap-2026-04-03');
    assert.ok(page2Body.nextCursor);
});

test('treasury POST requires write capability', async () => {
    __resetGovernanceStoreForTests();
    const response = await app.request('/v1/governance/treasury/snapshot', {
        method: 'POST',
        headers: authHeaders(['governance.read']),
        body: JSON.stringify(sampleSnapshot('snap-z', '2026-01-01T00:00:00.000Z')),
    });
    assert.equal(response.status, 403);
});
