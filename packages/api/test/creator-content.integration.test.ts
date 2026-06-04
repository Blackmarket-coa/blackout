import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
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
const { runScheduledContentDispatch } = await import('../src/services/scheduledContentDispatcher');

function authHeader(sub = 'creator-test-user'): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(sub, 'creator', 600)}`,
        'content-type': 'application/json',
    };
}

test('creator content: draft → publish → appears on home feed', async () => {
    const created = await app.request('/v1/creator/content', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ kind: 'article', title: 'Composting 101', body: 'Layer greens…' }),
    });
    assert.equal(created.status, 201);
    const { content } = (await created.json()) as {
        content: { id: string; status: string; creatorId: string };
    };
    assert.equal(content.status, 'draft');
    assert.equal(content.creatorId, 'creator-test-user');

    const published = await app.request(`/v1/creator/content/${content.id}/publish`, {
        method: 'POST',
        headers: authHeader(),
    });
    assert.equal(published.status, 200);
    const { content: live } = (await published.json()) as {
        content: { status: string; publishedAt: string };
    };
    assert.equal(live.status, 'published');
    assert.ok(live.publishedAt);

    const feed = await app.request('/v1/creator/content/feed');
    assert.equal(feed.status, 200);
    const { content: feedItems } = (await feed.json()) as { content: Array<{ id: string }> };
    assert.ok(feedItems.some((item) => item.id === content.id));
});

test('creator content: scheduled item auto-publishes when due', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const created = await app.request('/v1/creator/content', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ kind: 'video', title: 'Quail vs chickens', scheduledFor: past }),
    });
    assert.equal(created.status, 201);
    const { content } = (await created.json()) as { content: { id: string; status: string } };
    assert.equal(content.status, 'scheduled');

    // The background dispatcher tick publishes anything whose scheduledFor passed.
    const { published } = runScheduledContentDispatch();
    assert.ok(published >= 1);

    const feed = await app.request('/v1/creator/content/feed');
    const { content: feedItems } = (await feed.json()) as {
        content: Array<{ id: string; status: string }>;
    };
    const found = feedItems.find((item) => item.id === content.id);
    assert.ok(found, 'scheduled item should be on the home feed after dispatch');
    assert.equal(found?.status, 'published');
});

test('creator content: distribution to a coalition target', async () => {
    const created = await app.request('/v1/creator/content', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ kind: 'guide', title: 'Seed saving' }),
    });
    const { content } = (await created.json()) as { content: { id: string } };
    await app.request(`/v1/creator/content/${content.id}/publish`, {
        method: 'POST',
        headers: authHeader(),
    });

    const dist = await app.request(`/v1/creator/content/${content.id}/distribute`, {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ target: 'coalition', targetId: '!canopy:blackout' }),
    });
    assert.equal(dist.status, 201);

    const listed = await app.request(`/v1/creator/content/${content.id}/distributions`, {
        headers: authHeader(),
    });
    const { distributions } = (await listed.json()) as {
        distributions: Array<{ target: string; targetId?: string }>;
    };
    // publish auto-adds a 'home' distribution; we then added a coalition one.
    assert.ok(distributions.some((d) => d.target === 'home'));
    assert.ok(distributions.some((d) => d.target === 'coalition' && d.targetId === '!canopy:blackout'));
});

test('creator content: another creator cannot edit your content (403)', async () => {
    const created = await app.request('/v1/creator/content', {
        method: 'POST',
        headers: authHeader('owner-user'),
        body: JSON.stringify({ kind: 'article', title: 'Mine' }),
    });
    const { content } = (await created.json()) as { content: { id: string } };

    const res = await app.request(`/v1/creator/content/${content.id}`, {
        method: 'PATCH',
        headers: authHeader('intruder-user'),
        body: JSON.stringify({ title: 'Hijacked' }),
    });
    assert.equal(res.status, 403);
});

test('creator content: write requires auth', async () => {
    const res = await app.request('/v1/creator/content', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'article', title: 'Anon' }),
    });
    assert.equal(res.status, 401);
});
