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
const { __resetProfileStoreForTests } = await import('../src/services/profileStore');

function authHeaders(userId: string, capabilities: string[] = ['profile.read', 'profile.write']) {
    return {
        authorization: `Bearer ${signJwt(userId, userId.replace(/[^a-z0-9]/gi, '') || 'user', 600)}`,
        'content-type': 'application/json',
        'x-blackout-capabilities': capabilities.join(','),
    };
}

test('profile GET returns 404 before upsert', async () => {
    __resetProfileStoreForTests();
    const userId = 'profile-user-a';
    const response = await app.request(`/v1/profile/${userId}`, {
        headers: authHeaders(userId),
    });
    assert.equal(response.status, 404);
});

test('profile PUT upserts and GET returns the saved record', async () => {
    __resetProfileStoreForTests();
    const userId = 'profile-user-b';
    const put = await app.request(`/v1/profile/${userId}`, {
        method: 'PUT',
        headers: authHeaders(userId),
        body: JSON.stringify({
            displayName: 'Test User',
            roleBadges: ['Builder'],
            mutualSpaces: ['Test Space'],
            profile: {
                bio: 'hello world',
                pronouns: 'they/them',
                customTheme: { tokens: { accent: '#1ABC9C' } },
                connections: [{ type: 'github', url: 'https://github.com/test' }],
            },
        }),
    });
    assert.equal(put.status, 200);
    const saved = (await put.json()) as { displayName: string; profile: { bio?: string } };
    assert.equal(saved.displayName, 'Test User');
    assert.equal(saved.profile.bio, 'hello world');

    const get = await app.request(`/v1/profile/${userId}`, {
        headers: authHeaders(userId),
    });
    assert.equal(get.status, 200);
    const fetched = (await get.json()) as { profile: { bio?: string } };
    assert.equal(fetched.profile.bio, 'hello world');
});

test('profile PUT rejects edits to other users', async () => {
    __resetProfileStoreForTests();
    const response = await app.request('/v1/profile/profile-user-c', {
        method: 'PUT',
        headers: authHeaders('profile-user-d'),
        body: JSON.stringify({ displayName: 'Impostor' }),
    });
    assert.equal(response.status, 403);
});

test('profile PUT requires write capability', async () => {
    __resetProfileStoreForTests();
    const response = await app.request('/v1/profile/profile-user-e', {
        method: 'PUT',
        headers: authHeaders('profile-user-e', ['profile.read']),
        body: JSON.stringify({ displayName: 'No write' }),
    });
    assert.equal(response.status, 403);
});

test('profile PUT strips dangerous theme tokens', async () => {
    __resetProfileStoreForTests();
    const userId = 'profile-user-f';
    const response = await app.request(`/v1/profile/${userId}`, {
        method: 'PUT',
        headers: authHeaders(userId),
        body: JSON.stringify({
            profile: {
                customTheme: {
                    tokens: { accent: 'url(javascript:1)', panelBg: '#fff' },
                },
            },
        }),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
        profile: { customTheme?: { tokens?: Record<string, string> } };
    };
    const tokens = body.profile.customTheme?.tokens ?? {};
    assert.equal(tokens.accent, undefined);
    assert.equal(tokens.panelBg, '#fff');
});

test('profile wall append and list round-trip in chronological order', async () => {
    __resetProfileStoreForTests();
    const owner = 'profile-user-g';
    const visitor = 'profile-user-h';

    await app.request(`/v1/profile/${owner}`, {
        method: 'PUT',
        headers: authHeaders(owner),
        body: JSON.stringify({ displayName: 'Owner' }),
    });

    const post1 = await app.request(`/v1/profile/${owner}/wall`, {
        method: 'POST',
        headers: authHeaders(visitor),
        body: JSON.stringify({ body: 'first post' }),
    });
    assert.equal(post1.status, 201);

    await new Promise((resolve) => setTimeout(resolve, 5));

    const post2 = await app.request(`/v1/profile/${owner}/wall`, {
        method: 'POST',
        headers: authHeaders(visitor),
        body: JSON.stringify({ body: 'second post' }),
    });
    assert.equal(post2.status, 201);

    const wall = await app.request(`/v1/profile/${owner}/wall`, {
        headers: authHeaders(visitor),
    });
    assert.equal(wall.status, 200);
    const body = (await wall.json()) as { posts: Array<{ body: string; authorId: string }> };
    assert.equal(body.posts.length, 2);
    assert.equal(body.posts[0]!.body, 'second post');
    assert.equal(body.posts[1]!.body, 'first post');
    assert.equal(body.posts[0]!.authorId, visitor);
});
