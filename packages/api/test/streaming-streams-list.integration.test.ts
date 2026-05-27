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
const { db } = await import('../src/db/store');

async function issueToken(): Promise<string> {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const response = await app.request('/v1/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            username: `streams-user-${suffix}`,
            email: `streams-user-${suffix}@example.com`,
            password: 'test-password',
        }),
    });
    assert.equal(response.status, 201);
    const body = (await response.json()) as { token: string };
    return body.token;
}

const seedStream = (id: string, overrides: Partial<{
    state: 'live' | 'offline';
    visibility: 'public' | 'private' | 'member_only';
    creatorId: string;
    title: string;
    tags: string[];
}> = {}) =>
    db.upsertStream({
        id,
        creatorId: overrides.creatorId ?? 'creator-default',
        state: overrides.state ?? 'live',
        title: overrides.title ?? `Stream ${id}`,
        tags: overrides.tags ?? [],
        visibility: overrides.visibility ?? 'public',
        allowedSubscriberIds: [],
        latencyProfile: 'normal',
    });

test('GET /v1/streaming/streams lists public streams sorted live-first', async () => {
    const token = await issueToken();
    const headers = {
        authorization: `Bearer ${token}`,
        'x-blackout-capabilities': 'streaming.read',
    };

    seedStream('stream-public-live-A', { state: 'live', visibility: 'public' });
    seedStream('stream-public-offline-B', { state: 'offline', visibility: 'public' });
    seedStream('stream-private-C', { state: 'live', visibility: 'private' });

    const response = await app.request('/v1/streaming/streams', { headers });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
        items: { id: string; state: string; visibility: string }[];
    };
    const ids = body.items.map((item) => item.id);
    assert.ok(ids.includes('stream-public-live-A'));
    assert.ok(ids.includes('stream-public-offline-B'));
    // Private streams must never leak through the directory endpoint.
    assert.equal(ids.includes('stream-private-C'), false);
    // Live should sort before offline within a single response.
    assert.ok(ids.indexOf('stream-public-live-A') < ids.indexOf('stream-public-offline-B'));
});

test('GET /v1/streaming/streams supports state and creatorId filters and a limit', async () => {
    const token = await issueToken();
    const headers = {
        authorization: `Bearer ${token}`,
        'x-blackout-capabilities': 'streaming.read',
    };

    seedStream('stream-filter-live-1', {
        state: 'live',
        creatorId: 'filter-creator',
    });
    seedStream('stream-filter-offline-1', {
        state: 'offline',
        creatorId: 'filter-creator',
    });
    seedStream('stream-filter-other', { state: 'live', creatorId: 'other-creator' });

    const liveOnly = await app.request(
        '/v1/streaming/streams?state=live&creatorId=filter-creator',
        { headers },
    );
    assert.equal(liveOnly.status, 200);
    const liveBody = (await liveOnly.json()) as { items: { id: string; state: string }[] };
    assert.deepEqual(
        liveBody.items.map((entry) => entry.id),
        ['stream-filter-live-1'],
    );

    const limited = await app.request('/v1/streaming/streams?limit=1', { headers });
    assert.equal(limited.status, 200);
    const limitedBody = (await limited.json()) as { items: unknown[] };
    assert.equal(limitedBody.items.length, 1);
});

test('GET /v1/streaming/streams/:streamId returns the stream when public', async () => {
    const token = await issueToken();
    const headers = {
        authorization: `Bearer ${token}`,
        'x-blackout-capabilities': 'streaming.read',
    };

    seedStream('stream-detail-public', { state: 'live', visibility: 'public' });
    seedStream('stream-detail-private', { state: 'live', visibility: 'private' });

    const ok = await app.request('/v1/streaming/streams/stream-detail-public', { headers });
    assert.equal(ok.status, 200);
    const body = (await ok.json()) as { id: string; state: string };
    assert.equal(body.id, 'stream-detail-public');
    assert.equal(body.state, 'live');

    const denied = await app.request('/v1/streaming/streams/stream-detail-private', { headers });
    assert.equal(denied.status, 404);

    const missing = await app.request('/v1/streaming/streams/does-not-exist', { headers });
    assert.equal(missing.status, 404);
});

test('GET /v1/streaming/streams rejects unauthenticated callers', async () => {
    const response = await app.request('/v1/streaming/streams');
    assert.equal(response.status, 401);
});

test('GET /v1/streaming/streams allows authenticated users via the minted streaming.read capability', async () => {
    const token = await issueToken();
    const response = await app.request('/v1/streaming/streams', {
        headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200);
});

// ----------------------------- discovery / browse -----------------------------

const seedWithCategory = (
    id: string,
    category: string,
    opts: { title?: string; tags?: string[]; state?: 'live' | 'offline' } = {},
) =>
    db.upsertStream({
        id,
        creatorId: 'discovery-creator',
        state: opts.state ?? 'live',
        title: opts.title ?? `Stream ${id}`,
        category,
        tags: opts.tags ?? [],
        visibility: 'public',
        allowedSubscriberIds: [],
        latencyProfile: 'normal',
    });

test('GET /v1/streaming/streams filters by category, tags, and search', async () => {
    const token = await issueToken();
    const headers = { authorization: `Bearer ${token}`, 'x-blackout-capabilities': 'streaming.read' };

    seedWithCategory('disc-gaming-1', 'DiscGaming', { title: 'Speedrun marathon', tags: ['fps', 'co-op'] });
    seedWithCategory('disc-gaming-2', 'DiscGaming', { title: 'Chill puzzle night', tags: ['puzzle'] });
    seedWithCategory('disc-music-1', 'DiscMusic', { title: 'Live jazz set', tags: ['jazz'] });

    const byCategory = await app.request('/v1/streaming/streams?category=DiscGaming', { headers });
    const catIds = ((await byCategory.json()) as { items: { id: string }[] }).items.map((i) => i.id);
    assert.ok(catIds.includes('disc-gaming-1') && catIds.includes('disc-gaming-2'));
    assert.equal(catIds.includes('disc-music-1'), false);

    const byTag = await app.request('/v1/streaming/streams?tags=puzzle', { headers });
    const tagIds = ((await byTag.json()) as { items: { id: string }[] }).items.map((i) => i.id);
    assert.deepEqual(tagIds.filter((id) => id.startsWith('disc-')), ['disc-gaming-2']);

    const bySearch = await app.request('/v1/streaming/streams?search=jazz', { headers });
    const searchIds = ((await bySearch.json()) as { items: { id: string }[] }).items.map((i) => i.id);
    assert.deepEqual(searchIds.filter((id) => id.startsWith('disc-')), ['disc-music-1']);
});

test('GET /v1/streaming/streams?sort=title orders alphabetically', async () => {
    const token = await issueToken();
    const headers = { authorization: `Bearer ${token}`, 'x-blackout-capabilities': 'streaming.read' };

    seedWithCategory('sort-z', 'SortCat', { title: 'Zebra stream' });
    seedWithCategory('sort-a', 'SortCat', { title: 'Aardvark stream' });

    const res = await app.request('/v1/streaming/streams?category=SortCat&sort=title', { headers });
    const titles = ((await res.json()) as { items: { title: string }[] }).items.map((i) => i.title);
    assert.deepEqual(titles, ['Aardvark stream', 'Zebra stream']);
});

test('GET /v1/streaming/categories reports distinct categories with live counts', async () => {
    const token = await issueToken();
    const headers = { authorization: `Bearer ${token}`, 'x-blackout-capabilities': 'streaming.read' };

    seedWithCategory('cat-live-1', 'CatCountX', { state: 'live' });
    seedWithCategory('cat-live-2', 'CatCountX', { state: 'live' });
    seedWithCategory('cat-off-1', 'CatCountX', { state: 'offline' });

    const res = await app.request('/v1/streaming/categories', { headers });
    assert.equal(res.status, 200);
    const cats = ((await res.json()) as { categories: { name: string; total: number; live: number }[] })
        .categories;
    const x = cats.find((cat) => cat.name === 'CatCountX');
    assert.ok(x, 'CatCountX category present');
    assert.equal(x?.total, 3);
    assert.equal(x?.live, 2);
});

// ----------------------------- VODs (past broadcasts) -----------------------------

test('GET /v1/streaming/streams/:id/vods lists replayable sessions newest-first', async () => {
    const token = await issueToken();
    const headers = { authorization: `Bearer ${token}`, 'x-blackout-capabilities': 'streaming.read' };

    seedStream('vod-stream', { state: 'offline', visibility: 'public' });
    // Older ended session with a replay.
    db.createStreamSession({ id: 'vod-sess-old', streamId: 'vod-stream', startedAt: '2026-05-01T10:00:00Z' });
    db.endStreamSession('vod-sess-old', 'mxc://vod/old');
    // Newer ended session with a replay (duration 1h).
    db.createStreamSession({ id: 'vod-sess-new', streamId: 'vod-stream', startedAt: '2026-05-10T12:00:00Z' });
    db.endStreamSession('vod-sess-new', 'mxc://vod/new');
    // A session with NO replay pointer — must be excluded.
    db.createStreamSession({ id: 'vod-sess-none', streamId: 'vod-stream', startedAt: '2026-05-12T09:00:00Z' });

    const res = await app.request('/v1/streaming/streams/vod-stream/vods', { headers });
    assert.equal(res.status, 200);
    const items = ((await res.json()) as { items: { id: string; replayPointer?: string }[] }).items;
    const ids = items.map((i) => i.id);
    // Newest-first, replay-only.
    assert.deepEqual(ids, ['vod-sess-new', 'vod-sess-old']);
    assert.equal(items[0].replayPointer, 'mxc://vod/new');
});

test('GET /v1/streaming/streams/:id/vods 404s for a private/missing stream', async () => {
    const token = await issueToken();
    const headers = { authorization: `Bearer ${token}`, 'x-blackout-capabilities': 'streaming.read' };

    seedStream('vod-private', { state: 'offline', visibility: 'private' });
    const priv = await app.request('/v1/streaming/streams/vod-private/vods', { headers });
    assert.equal(priv.status, 404);

    const missing = await app.request('/v1/streaming/streams/vod-nope/vods', { headers });
    assert.equal(missing.status, 404);
});
