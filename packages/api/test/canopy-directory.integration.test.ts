import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';
process.env.LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'wss://livekit.local';
process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? 'lk_test_key';
process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? 'lk_test_secret';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { __resetCanopyDirectoryForTests } = await import('../src/services/canopyDirectory');

function discoveryHeaders(capabilities = ['discovery.read', 'discovery.write']) {
    return {
        authorization: `Bearer ${signJwt('canopy-test-user', 'canopytest', 600)}`,
        'content-type': 'application/json',
        'x-blackout-capabilities': capabilities.join(','),
    };
}

test('canopies list is empty before any registration', async () => {
    __resetCanopyDirectoryForTests();
    const response = await app.request('/v1/discovery/canopies', {
        headers: discoveryHeaders(),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { items: unknown[] };
    assert.deepEqual(body.items, []);
});

test('canopy index → list round-trip + federation tier filter', async () => {
    __resetCanopyDirectoryForTests();
    const headers = discoveryHeaders();

    for (const entry of [
        { canopyId: 'gardens', name: 'Garden Canopy', federationTier: 'local' },
        { canopyId: 'planet', name: 'Planet Canopy', federationTier: 'global' },
        { canopyId: 'zone-1', name: 'Zone One', federationTier: 'zone' },
    ]) {
        const response = await app.request('/v1/discovery/index/canopies', {
            method: 'POST',
            headers,
            body: JSON.stringify(entry),
        });
        assert.equal(response.status, 202);
    }

    const all = await app.request('/v1/discovery/canopies', { headers });
    const allBody = (await all.json()) as {
        items: Array<{ canopyId: string; federationTier: string }>;
    };
    assert.equal(allBody.items.length, 3);

    const onlyGlobal = await app.request('/v1/discovery/canopies?federationTier=global', {
        headers,
    });
    const globalBody = (await onlyGlobal.json()) as {
        items: Array<{ canopyId: string; federationTier: string }>;
    };
    assert.equal(globalBody.items.length, 1);
    assert.equal(globalBody.items[0]!.canopyId, 'planet');
});

test('canopy index requires write capability', async () => {
    __resetCanopyDirectoryForTests();
    const response = await app.request('/v1/discovery/index/canopies', {
        method: 'POST',
        headers: discoveryHeaders(['discovery.read']),
        body: JSON.stringify({ canopyId: 'no-write', name: 'No Write' }),
    });
    assert.equal(response.status, 403);
});

test('apps install rejects unknown canopy with code unknown_canopy', async () => {
    __resetCanopyDirectoryForTests();
    const response = await app.request('/v1/apps/directory/welcome-ops/install', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ canopyId: 'never-registered', permissions: ['members:read'] }),
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { code?: string };
    assert.equal(body.code, 'unknown_canopy');
});

test('apps install succeeds after canopy is registered', async () => {
    __resetCanopyDirectoryForTests();
    const headers = discoveryHeaders();
    await app.request('/v1/discovery/index/canopies', {
        method: 'POST',
        headers,
        body: JSON.stringify({ canopyId: 'ops-canopy', name: 'Ops Canopy' }),
    });
    const install = await app.request('/v1/apps/directory/welcome-ops/install', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ canopyId: 'ops-canopy', permissions: ['members:read'] }),
    });
    assert.equal(install.status, 201);
});
