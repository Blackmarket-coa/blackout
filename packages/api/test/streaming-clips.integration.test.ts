import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '1000';

const { default: app } = await import('../src/index');

async function issueToken(): Promise<{ token: string; userId: string }> {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const response = await app.request('/v1/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            username: `clips-user-${suffix}`,
            email: `clips-user-${suffix}@example.com`,
            password: 'test-password',
        }),
    });
    assert.equal(response.status, 201);
    const body = (await response.json()) as { token: string; userId: string };
    return { token: body.token, userId: body.userId };
}

test('POST /v1/streaming/clips creates a clip owned by the caller; it then lists and reads back', async () => {
    const { token, userId: creatorId } = await issueToken();
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

    const created = await app.request('/v1/streaming/clips', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            creatorId,
            title: 'Best moment',
            mediaPointer: 'mxc://blackout/clip-1',
            durationSeconds: 42,
            tags: ['highlight'],
        }),
    });
    assert.equal(created.status, 201);
    const clip = (await created.json()) as { id: string; visibility: string; creatorId: string };
    assert.equal(clip.creatorId, creatorId);
    assert.equal(clip.visibility, 'public');

    const list = await app.request(`/v1/streaming/clips?creatorId=${creatorId}`, {
        headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(list.status, 200);
    const listBody = (await list.json()) as { items: { id: string }[] };
    assert.ok(listBody.items.some((item) => item.id === clip.id));

    const detail = await app.request(`/v1/streaming/clips/${clip.id}`, {
        headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(detail.status, 200);
    const detailBody = (await detail.json()) as { id: string; title: string };
    assert.equal(detailBody.title, 'Best moment');
});

test('POST /v1/streaming/clips rejects a creatorId that is not the caller', async () => {
    const { token } = await issueToken();
    const response = await app.request('/v1/streaming/clips', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
            creatorId: 'someone-else',
            title: 'Spoofed',
            mediaPointer: 'mxc://blackout/clip-x',
        }),
    });
    assert.equal(response.status, 403);
});

test('private clips never leak through the directory or detail endpoints', async () => {
    const { token, userId: creatorId } = await issueToken();
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

    const created = await app.request('/v1/streaming/clips', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            creatorId,
            title: 'Hidden',
            mediaPointer: 'mxc://blackout/clip-private',
            visibility: 'private',
        }),
    });
    assert.equal(created.status, 201);
    const clip = (await created.json()) as { id: string };

    const list = await app.request(`/v1/streaming/clips?creatorId=${creatorId}`, {
        headers: { authorization: `Bearer ${token}` },
    });
    const listBody = (await list.json()) as { items: { id: string }[] };
    assert.equal(
        listBody.items.some((item) => item.id === clip.id),
        false
    );

    const detail = await app.request(`/v1/streaming/clips/${clip.id}`, {
        headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(detail.status, 404);
});

test('DELETE /v1/streaming/clips/:clipId removes the caller-owned clip', async () => {
    const { token, userId: creatorId } = await issueToken();
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

    const created = await app.request('/v1/streaming/clips', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            creatorId,
            title: 'Temp',
            mediaPointer: 'mxc://blackout/clip-temp',
        }),
    });
    const clip = (await created.json()) as { id: string };

    const deleted = await app.request(`/v1/streaming/clips/${clip.id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(deleted.status, 200);

    const detail = await app.request(`/v1/streaming/clips/${clip.id}`, {
        headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(detail.status, 404);
});

test('GET /v1/streaming/clips rejects unauthenticated callers', async () => {
    const response = await app.request('/v1/streaming/clips');
    assert.equal(response.status, 401);
});
