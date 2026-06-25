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
const { __resetSettingsStoreForTests } = await import('../src/services/settingsStore');

function authHeaders(userId: string) {
    return {
        authorization: `Bearer ${signJwt(userId, userId.replace(/[^a-z0-9]/gi, '') || 'user', 600)}`,
        'content-type': 'application/json',
    };
}

test('settings GET returns an empty bucket before any write', async () => {
    __resetSettingsStoreForTests();
    const res = await app.request('/v1/settings/account/labs', {
        headers: authHeaders('settings-user-a'),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
        subject: string;
        bucket: { scope: string; category: string; values: Record<string, unknown> };
    };
    assert.equal(body.subject, 'settings-user-a');
    assert.equal(body.bucket.scope, 'account');
    assert.equal(body.bucket.category, 'labs');
    assert.deepEqual(body.bucket.values, {});
});

test('settings PUT then GET round-trips a value for the same subject', async () => {
    __resetSettingsStoreForTests();
    const userId = 'settings-user-b';
    const put = await app.request('/v1/settings/account/labs/flag.video-rooms', {
        method: 'PUT',
        headers: authHeaders(userId),
        body: JSON.stringify({ value: true }),
    });
    assert.equal(put.status, 200);
    const saved = (await put.json()) as {
        bucket: { values: Record<string, unknown> };
        event: { module: string; type: string };
    };
    assert.equal(saved.bucket.values['flag.video-rooms'], true);
    assert.equal(saved.event.module, 'settings');
    assert.equal(saved.event.type, 'settings.changed');

    const get = await app.request('/v1/settings/account/labs', {
        headers: authHeaders(userId),
    });
    assert.equal(get.status, 200);
    const fetched = (await get.json()) as { bucket: { values: Record<string, unknown> } };
    assert.equal(fetched.bucket.values['flag.video-rooms'], true);
});

test('settings PUT with value:null clears the key', async () => {
    __resetSettingsStoreForTests();
    const userId = 'settings-user-c';
    await app.request('/v1/settings/account/labs/flag.beta', {
        method: 'PUT',
        headers: authHeaders(userId),
        body: JSON.stringify({ value: true }),
    });
    const clear = await app.request('/v1/settings/account/labs/flag.beta', {
        method: 'PUT',
        headers: authHeaders(userId),
        body: JSON.stringify({ value: null }),
    });
    assert.equal(clear.status, 200);
    const get = await app.request('/v1/settings/account/labs', {
        headers: authHeaders(userId),
    });
    const fetched = (await get.json()) as { bucket: { values: Record<string, unknown> } };
    assert.equal('flag.beta' in fetched.bucket.values, false);
});

test('settings buckets are isolated per subject', async () => {
    __resetSettingsStoreForTests();
    await app.request('/v1/settings/account/labs/flag.x', {
        method: 'PUT',
        headers: authHeaders('settings-user-d'),
        body: JSON.stringify({ value: true }),
    });
    const other = await app.request('/v1/settings/account/labs', {
        headers: authHeaders('settings-user-e'),
    });
    const body = (await other.json()) as { bucket: { values: Record<string, unknown> } };
    assert.deepEqual(body.bucket.values, {});
});

test('settings GET requires authentication', async () => {
    __resetSettingsStoreForTests();
    const res = await app.request('/v1/settings/account/labs');
    assert.equal(res.status, 401);
});

test('settings PUT requires authentication', async () => {
    __resetSettingsStoreForTests();
    const res = await app.request('/v1/settings/account/labs/flag.x', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: true }),
    });
    assert.equal(res.status, 401);
});

test('settings rejects an unknown scope or category', async () => {
    __resetSettingsStoreForTests();
    const badScope = await app.request('/v1/settings/galaxy/labs', {
        headers: authHeaders('settings-user-f'),
    });
    assert.equal(badScope.status, 400);
    const badCategory = await app.request('/v1/settings/account/wormhole', {
        headers: authHeaders('settings-user-f'),
    });
    assert.equal(badCategory.status, 400);
});
