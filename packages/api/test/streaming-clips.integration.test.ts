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

test('PATCH /v1/streaming/clips/:clipId updates owner-owned fields', async () => {
    const { token, userId: creatorId } = await issueToken();
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

    const created = await app.request('/v1/streaming/clips', {
        method: 'POST',
        headers,
        body: JSON.stringify({ creatorId, title: 'Before', mediaPointer: 'mxc://blackout/clip-edit' }),
    });
    const clip = (await created.json()) as { id: string; updatedAt: string };

    const patched = await app.request(`/v1/streaming/clips/${clip.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ title: 'After', visibility: 'member_only', tags: ['edited'] }),
    });
    assert.equal(patched.status, 200);
    const body = (await patched.json()) as {
        id: string;
        title: string;
        visibility: string;
        tags: string[];
        updatedAt: string;
    };
    assert.equal(body.id, clip.id);
    assert.equal(body.title, 'After');
    assert.equal(body.visibility, 'member_only');
    assert.deepEqual(body.tags, ['edited']);
});

test('PATCH /v1/streaming/clips/:clipId rejects an empty patch with 400', async () => {
    const { token, userId: creatorId } = await issueToken();
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

    const created = await app.request('/v1/streaming/clips', {
        method: 'POST',
        headers,
        body: JSON.stringify({ creatorId, title: 'NoOp', mediaPointer: 'mxc://blackout/clip-noop' }),
    });
    const clip = (await created.json()) as { id: string };

    const patched = await app.request(`/v1/streaming/clips/${clip.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({}),
    });
    assert.equal(patched.status, 400);
});

test('PATCH /v1/streaming/clips/:clipId rejects a non-owner with 403', async () => {
    const { token, userId: creatorId } = await issueToken();
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

    const created = await app.request('/v1/streaming/clips', {
        method: 'POST',
        headers,
        body: JSON.stringify({ creatorId, title: 'Mine', mediaPointer: 'mxc://blackout/clip-owned' }),
    });
    const clip = (await created.json()) as { id: string };

    const { token: otherToken } = await issueToken();
    const patched = await app.request(`/v1/streaming/clips/${clip.id}`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${otherToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Hijacked' }),
    });
    assert.equal(patched.status, 403);
});

test('PATCH /v1/streaming/clips/:clipId returns 404 for an unknown clip', async () => {
    const { token } = await issueToken();
    const patched = await app.request('/v1/streaming/clips/00000000-0000-0000-0000-000000000000', {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'ghost' }),
    });
    assert.equal(patched.status, 404);
});

test('clip writes are rate limited per client (429 once the bucket is exhausted)', async () => {
    const { token, userId: creatorId } = await issueToken();
    // Distinct forwarded IP so this bucket is isolated from the other tests'
    // `local` bucket; the default clip-write limit is 30/min.
    const headers = {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.77',
    };

    const statuses: number[] = [];
    for (let i = 0; i < 31; i += 1) {
        const res = await app.request('/v1/streaming/clips', {
            method: 'POST',
            headers,
            body: JSON.stringify({ creatorId, title: `Flood ${i}`, mediaPointer: `mxc://blackout/flood-${i}` }),
        });
        statuses.push(res.status);
    }

    assert.ok(
        statuses.slice(0, 30).every((s) => s === 201),
        'first 30 writes should be accepted',
    );
    assert.equal(statuses[30], 429, '31st write should be rate limited');
});

test('GET /v1/streaming/clips rejects unauthenticated callers', async () => {
    const response = await app.request('/v1/streaming/clips');
    assert.equal(response.status, 401);
});
