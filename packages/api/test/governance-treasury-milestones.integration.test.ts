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

const milestone = (id: string, overrides: Record<string, unknown> = {}) => ({
    milestoneId: id,
    title: `Goal ${id}`,
    asset: 'USDC',
    target: 50000,
    status: 'active',
    createdAt: '2026-06-24T00:00:00.000Z',
    ...overrides,
});

test('create → list returns the milestone', async () => {
    __resetGovernanceStoreForTests();
    const headers = authHeaders();

    const created = await app.request('/v1/governance/treasury/milestones', {
        method: 'POST',
        headers,
        body: JSON.stringify(milestone('m1')),
    });
    assert.equal(created.status, 201);

    const list = await app.request('/v1/governance/treasury/milestones', { headers });
    assert.equal(list.status, 200);
    const body = (await list.json()) as { items: Array<{ milestoneId: string }> };
    assert.deepEqual(
        body.items.map((entry) => entry.milestoneId),
        ['m1'],
    );
});

test('archived milestones are excluded unless requested', async () => {
    __resetGovernanceStoreForTests();
    const headers = authHeaders();

    await app.request('/v1/governance/treasury/milestones', {
        method: 'POST',
        headers,
        body: JSON.stringify(milestone('active-1', { createdAt: '2026-06-02T00:00:00.000Z' })),
    });
    await app.request('/v1/governance/treasury/milestones', {
        method: 'POST',
        headers,
        body: JSON.stringify(
            milestone('archived-1', { status: 'archived', createdAt: '2026-06-01T00:00:00.000Z' }),
        ),
    });

    const def = await app.request('/v1/governance/treasury/milestones', { headers });
    const defBody = (await def.json()) as { items: Array<{ milestoneId: string }> };
    assert.deepEqual(
        defBody.items.map((entry) => entry.milestoneId),
        ['active-1'],
    );

    const all = await app.request('/v1/governance/treasury/milestones?includeArchived=1', { headers });
    const allBody = (await all.json()) as { items: Array<{ milestoneId: string }> };
    // Newest-first by createdAt.
    assert.deepEqual(
        allBody.items.map((entry) => entry.milestoneId),
        ['active-1', 'archived-1'],
    );
});

test('re-upserting the same id edits status (active → met)', async () => {
    __resetGovernanceStoreForTests();
    const headers = authHeaders();

    await app.request('/v1/governance/treasury/milestones', {
        method: 'POST',
        headers,
        body: JSON.stringify(milestone('m2')),
    });
    await app.request('/v1/governance/treasury/milestones', {
        method: 'POST',
        headers,
        body: JSON.stringify(milestone('m2', { status: 'met', metAt: '2026-06-25T00:00:00.000Z' })),
    });

    const list = await app.request('/v1/governance/treasury/milestones', { headers });
    const body = (await list.json()) as { items: Array<{ milestoneId: string; status: string }> };
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0]!.status, 'met');
});

test('POST requires write capability', async () => {
    __resetGovernanceStoreForTests();
    const response = await app.request('/v1/governance/treasury/milestones', {
        method: 'POST',
        headers: authHeaders(['governance.read']),
        body: JSON.stringify(milestone('m3')),
    });
    assert.equal(response.status, 403);
});

test('rejects a non-positive target', async () => {
    __resetGovernanceStoreForTests();
    const response = await app.request('/v1/governance/treasury/milestones', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(milestone('m4', { target: 0 })),
    });
    assert.equal(response.status, 400);
});
