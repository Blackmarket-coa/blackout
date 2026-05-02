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
const { __resetStegoStoreForTests } = await import('../src/services/stegoStore');

function authHeaders(userId: string, capabilities: string[] = ['stego.read', 'stego.write']) {
    return {
        authorization: `Bearer ${signJwt(userId, userId.replace(/[^a-z0-9]/gi, '') || 'user', 600)}`,
        'content-type': 'application/json',
        'x-blackout-capabilities': capabilities.join(','),
    };
}

const userId = 'stego-test-user';

test('stego list is empty for a fresh subject', async () => {
    __resetStegoStoreForTests();
    const response = await app.request('/v1/stego/channels', {
        headers: authHeaders(userId),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { subject: string; channels: unknown[] };
    assert.equal(body.subject, userId);
    assert.deepEqual(body.channels, []);
});

test('stego create → list → get → rotate → expire round-trip', async () => {
    __resetStegoStoreForTests();
    const headers = authHeaders(userId);

    const create = await app.request('/v1/stego/channels', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            name: 'broadcast',
            audience: 'General',
            carrier: 'image',
            ephemeralMode: 'expire_after_hours',
            ttlHours: 24,
            rotationDays: 14,
            passphrase: 'a-strong-passphrase',
        }),
    });
    assert.equal(create.status, 201);
    const created = (await create.json()) as {
        event: string;
        payload: { channelId: string; ttlHours?: number };
    };
    assert.equal(created.event, 'blackout.stego.channel.created');
    assert.equal(created.payload.channelId, 'broadcast');
    assert.equal(created.payload.ttlHours, 24);

    const list = await app.request('/v1/stego/channels', { headers });
    const listBody = (await list.json()) as {
        channels: Array<{ channelId: string; rotationIndex: number }>;
    };
    assert.equal(listBody.channels.length, 1);
    assert.equal(listBody.channels[0]!.channelId, 'broadcast');
    assert.equal(listBody.channels[0]!.rotationIndex, 0);

    const get = await app.request('/v1/stego/channels/broadcast', { headers });
    assert.equal(get.status, 200);

    const rotate = await app.request('/v1/stego/channels/broadcast/rotate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ passphrase: 'a-stronger-passphrase' }),
    });
    assert.equal(rotate.status, 200);
    const rotated = (await rotate.json()) as {
        event: string;
        payload: { rotationIndex: number; materialFingerprint: string };
    };
    assert.equal(rotated.event, 'blackout.stego.channel.rotated');
    assert.equal(rotated.payload.rotationIndex, 1);
    assert.ok(rotated.payload.materialFingerprint.length > 0);

    const expire = await app.request('/v1/stego/channels/broadcast', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ reason: 'operator_revoked' }),
    });
    assert.equal(expire.status, 200);
    const expired = (await expire.json()) as { payload: { reason: string } };
    assert.equal(expired.payload.reason, 'operator_revoked');

    const afterExpire = await app.request('/v1/stego/channels/broadcast', { headers });
    const snapshot = (await afterExpire.json()) as { expiryReason?: string };
    assert.equal(snapshot.expiryReason, 'operator_revoked');
});

test('stego rotate after expire is rejected', async () => {
    __resetStegoStoreForTests();
    const headers = authHeaders(userId);
    await app.request('/v1/stego/channels', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            name: 'covert',
            audience: 'General',
            carrier: 'text',
            ephemeralMode: 'persistent',
            rotationDays: 0,
            passphrase: 'phraseyphrase',
        }),
    });
    await app.request('/v1/stego/channels/covert', { method: 'DELETE', headers });
    const rotate = await app.request('/v1/stego/channels/covert/rotate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ passphrase: 'phraseyphrase' }),
    });
    assert.equal(rotate.status, 400);
});

test('stego create rejects expire_after_hours without ttlHours', async () => {
    __resetStegoStoreForTests();
    const response = await app.request('/v1/stego/channels', {
        method: 'POST',
        headers: authHeaders(userId),
        body: JSON.stringify({
            name: 'no-ttl',
            audience: 'General',
            carrier: 'text',
            ephemeralMode: 'expire_after_hours',
            rotationDays: 0,
            passphrase: 'phraseyphrase',
        }),
    });
    assert.equal(response.status, 400);
});

test('stego rejects requests without write capability', async () => {
    __resetStegoStoreForTests();
    const response = await app.request('/v1/stego/channels', {
        method: 'POST',
        headers: authHeaders(userId, ['stego.read']),
        body: JSON.stringify({
            name: 'anything',
            audience: 'General',
            carrier: 'text',
            ephemeralMode: 'persistent',
            rotationDays: 0,
            passphrase: 'phraseyphrase',
        }),
    });
    assert.equal(response.status, 403);
});

test('stego scopes channels per subject', async () => {
    __resetStegoStoreForTests();
    const alice = authHeaders('stego-alice');
    const bob = authHeaders('stego-bob');

    await app.request('/v1/stego/channels', {
        method: 'POST',
        headers: alice,
        body: JSON.stringify({
            name: 'alice-only',
            audience: 'General',
            carrier: 'text',
            ephemeralMode: 'persistent',
            rotationDays: 0,
            passphrase: 'alicepass-123',
        }),
    });

    const bobList = await app.request('/v1/stego/channels', { headers: bob });
    const bobBody = (await bobList.json()) as { channels: unknown[] };
    assert.deepEqual(bobBody.channels, []);

    const aliceList = await app.request('/v1/stego/channels', { headers: alice });
    const aliceBody = (await aliceList.json()) as { channels: Array<{ channelId: string }> };
    assert.equal(aliceBody.channels.length, 1);
    assert.equal(aliceBody.channels[0]!.channelId, 'alice-only');
});
