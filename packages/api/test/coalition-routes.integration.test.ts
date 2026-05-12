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

function authHeader(): Record<string, string> {
    return { authorization: `Bearer ${signJwt('coalition-test-user', 'coalition', 600)}` };
}

test('coalition feed returns ranked items', async () => {
    const response = await app.request('/v1/coalition/feed', { headers: authHeader() });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
        items: Array<{ id: string; score: number }>;
        generatedAt: string;
    };
    assert.ok(Array.isArray(body.items));
    assert.ok(body.items.length > 0);
    for (let i = 1; i < body.items.length; i++) {
        assert.ok(body.items[i - 1]!.score >= body.items[i]!.score);
    }
});

test('coalition feed filters by kind=video', async () => {
    const response = await app.request('/v1/coalition/feed?kind=video', { headers: authHeader() });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { items: Array<{ kind: string }> };
    assert.ok(body.items.every((item) => item.kind === 'video'));
});

test('coalition feed rejects bad limit', async () => {
    const response = await app.request('/v1/coalition/feed?limit=999', { headers: authHeader() });
    assert.equal(response.status, 400);
});

test('coalition spatial-feed returns layered items', async () => {
    const response = await app.request('/v1/coalition/spatial-feed', { headers: authHeader() });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
        items: Array<{ layer: string }>;
        layers: string[];
    };
    assert.ok(body.layers.includes('vendors'));
    assert.ok(body.items.length > 0);
});

test('coalition spatial-feed filters by layer', async () => {
    const response = await app.request('/v1/coalition/spatial-feed?layers=aid', {
        headers: authHeader(),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { items: Array<{ layer: string }> };
    assert.ok(body.items.every((item) => item.layer === 'aid'));
});

test('coalition mutual-aid lists posts', async () => {
    const response = await app.request('/v1/coalition/mutual-aid', { headers: authHeader() });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { posts: Array<{ id: string }> };
    assert.ok(body.posts.length >= 2);
});

test('coalition mutual-aid create requires auth', async () => {
    const response = await app.request('/v1/coalition/mutual-aid', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
    });
    assert.equal(response.status, 401);
});

test('coalition mutual-aid create accepts a valid post', async () => {
    const response = await app.request('/v1/coalition/mutual-aid', {
        method: 'POST',
        headers: { ...authHeader(), 'content-type': 'application/json' },
        body: JSON.stringify({
            type: 'offer',
            category: 'food',
            title: 'Fresh sourdough loaves',
            description: 'Two free loaves at the corner stand, first come first served.',
            location: { latitude: 40.71, longitude: -74.0 },
            displayRadiusMeters: 600,
            urgency: 'low',
        }),
    });
    assert.equal(response.status, 201);
    const body = (await response.json()) as { post: { id: string; status: string } };
    assert.ok(body.post.id.startsWith('aidp_'));
    assert.equal(body.post.status, 'open');
});

test('coalition mutual-aid create rejects bad coordinates', async () => {
    const response = await app.request('/v1/coalition/mutual-aid', {
        method: 'POST',
        headers: { ...authHeader(), 'content-type': 'application/json' },
        body: JSON.stringify({
            type: 'need',
            category: 'food',
            title: 't',
            description: 'd',
            location: { latitude: 999, longitude: 0 },
        }),
    });
    assert.equal(response.status, 400);
});

test('coalition seller-locations returns visible vendors', async () => {
    const response = await app.request('/v1/coalition/seller-locations', { headers: authHeader() });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
        locations: Array<{ id: string; isVisible: boolean }>;
    };
    assert.ok(body.locations.length >= 2);
    assert.ok(body.locations.every((location) => location.isVisible));
});
