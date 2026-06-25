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

test('profile GET returns a synthesized default before upsert', async () => {
    __resetProfileStoreForTests();
    const userId = 'profile-user-a';
    const response = await app.request(`/v1/profile/${userId}`, {
        headers: authHeaders(userId),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
        userId: string;
        displayName: string;
        roleBadges: string[];
        mutualSpaces: string[];
    };
    assert.equal(body.userId, userId);
    assert.equal(body.displayName, userId);
    assert.deepEqual(body.roleBadges, []);
    assert.deepEqual(body.mutualSpaces, []);
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

test('profile PUT to own profile is granted by default (profile.write)', async () => {
    __resetProfileStoreForTests();
    // profile.write is part of every user's token capabilities, so editing
    // one's own profile succeeds even without an explicit write header. The
    // meaningful gate is ownership (subject === userId), covered by the
    // "rejects edits to other users" test above.
    const response = await app.request('/v1/profile/profile-user-e', {
        method: 'PUT',
        headers: authHeaders('profile-user-e', ['profile.read']),
        body: JSON.stringify({ displayName: 'Self edit' }),
    });
    assert.equal(response.status, 200);
});

test('profile PUT accepts the owner addressed by their Matrix id (sub is a Blackout id)', async () => {
    __resetProfileStoreForTests();
    // Production identity split: the session JWT subject is the Blackout user id
    // (a UUID), while the client edits the profile keyed by Matrix id
    // (mx.getUserId()). MATRIX_HOMESERVER_DOMAIN is unset under test, so the
    // canonical id falls back to the `blackout.local` default.
    const blackoutSub = 'blackout-user-uuid-1';
    const username = 'crashdummy';
    const matrixId = '@crashdummy:blackout.local';
    const response = await app.request(`/v1/profile/${encodeURIComponent(matrixId)}`, {
        method: 'PUT',
        headers: {
            authorization: `Bearer ${signJwt(blackoutSub, username, 600)}`,
            'content-type': 'application/json',
            'x-blackout-capabilities': 'profile.read,profile.write',
        },
        body: JSON.stringify({ displayName: 'Crash Dummy' }),
    });
    assert.equal(response.status, 200);
    const saved = (await response.json()) as { userId: string; displayName: string };
    assert.equal(saved.userId, matrixId);
    assert.equal(saved.displayName, 'Crash Dummy');
});

test('profile PUT still rejects a Matrix-id path that belongs to another user', async () => {
    __resetProfileStoreForTests();
    // Same Matrix-id target, but the caller's token username (localpart) differs.
    const response = await app.request(`/v1/profile/${encodeURIComponent('@crashdummy:blackout.local')}`, {
        method: 'PUT',
        headers: {
            authorization: `Bearer ${signJwt('blackout-user-uuid-2', 'someoneelse', 600)}`,
            'content-type': 'application/json',
            'x-blackout-capabilities': 'profile.read,profile.write',
        },
        body: JSON.stringify({ displayName: 'Impostor' }),
    });
    assert.equal(response.status, 403);
});

test('profile PUT accepts the owner regardless of the MXID domain (no MATRIX_HOMESERVER_DOMAIN coupling)', async () => {
    __resetProfileStoreForTests();
    // Reproduces the production 403: the path MXID domain (`theblackout.app`) is
    // NOT the server's configured homeserver domain (unset under test → the old
    // code reconstructed `@crashdummy:blackout.local` and 403'd the real owner).
    // Ownership now matches on the MXID localpart vs the token username, so the
    // self-edit succeeds independent of MATRIX_HOMESERVER_DOMAIN.
    const matrixId = '@crashdummy:theblackout.app';
    const response = await app.request(`/v1/profile/${encodeURIComponent(matrixId)}`, {
        method: 'PUT',
        headers: {
            authorization: `Bearer ${signJwt('blackout-user-uuid-3', 'crashdummy', 600)}`,
            'content-type': 'application/json',
            'x-blackout-capabilities': 'profile.read,profile.write',
        },
        body: JSON.stringify({ displayName: 'Crash Dummy' }),
    });
    assert.equal(response.status, 200);
    const saved = (await response.json()) as { userId: string; displayName: string };
    assert.equal(saved.userId, matrixId);
    assert.equal(saved.displayName, 'Crash Dummy');
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

test('public profile GET 404s until the owner opts in', async () => {
    __resetProfileStoreForTests();
    const userId = 'profile-user-pub-a';
    // Seed a profile that is NOT public.
    await app.request(`/v1/profile/${userId}`, {
        method: 'PUT',
        headers: authHeaders(userId),
        body: JSON.stringify({ profile: { bio: 'hidden' } }),
    });
    // No auth header — this is the zero-auth public read.
    const res = await app.request(`/v1/profile/${userId}/public`);
    assert.equal(res.status, 404);
});

test('public profile GET returns safe fields and strips contact connections, no auth', async () => {
    __resetProfileStoreForTests();
    const userId = 'profile-user-pub-b';
    await app.request(`/v1/profile/${userId}`, {
        method: 'PUT',
        headers: authHeaders(userId),
        body: JSON.stringify({
            displayName: 'Public Creator',
            profile: {
                public: true,
                bio: 'shipping in public',
                pronouns: 'they/them',
                sponsors: ['acme-goods'],
                badgeIds: ['founder'],
                connections: [
                    { type: 'github', url: 'https://github.com/test' },
                    { type: 'fbm', username: 'creator-store', url: 'https://freeblackmarket.com/creator-store' },
                    { type: 'email', url: 'mailto:secret@example.com' },
                    { type: 'phone', url: 'tel:+15551234' },
                ],
            },
        }),
    });

    const res = await app.request(`/v1/profile/${userId}/public`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
        displayName: string;
        profile: {
            bio?: string;
            public?: boolean;
            sponsors?: string[];
            badgeIds?: string[];
            connections?: Array<{ type: string }>;
        };
    };
    assert.equal(body.displayName, 'Public Creator');
    assert.equal(body.profile.bio, 'shipping in public');
    assert.equal(body.profile.public, true);
    assert.deepEqual(body.profile.sponsors, ['acme-goods']);
    assert.deepEqual(body.profile.badgeIds, ['founder']);
    const types = (body.profile.connections ?? []).map((c) => c.type).sort();
    assert.deepEqual(types, ['fbm', 'github']);
});
