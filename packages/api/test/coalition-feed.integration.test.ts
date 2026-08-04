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

function authHeader(user = 'feed-test-user'): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(user, 'community', 600)}`,
        'content-type': 'application/json',
    };
}

// Seeded video feed item (see COALITION_FEED_SEED in db/coalitionSeed.ts).
const VIDEO_ID = 'feed-video-1';

test('coalition feed likes: toggle is idempotent on (item, user) and counts active', async () => {
    const like = async (active: boolean, user?: string) =>
        app.request(`/v1/coalition/feed/${VIDEO_ID}/likes`, {
            method: 'POST',
            headers: authHeader(user),
            body: JSON.stringify({ active }),
        });

    const first = await like(true);
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { count: 1, likedByMe: true });

    // Re-liking is idempotent — composite key keeps a single row.
    const again = await like(true);
    assert.deepEqual(await again.json(), { count: 1, likedByMe: true });

    // A second user adds to the count.
    const other = await like(true, 'feed-test-user-2');
    assert.deepEqual(await other.json(), { count: 2, likedByMe: true });

    // Unliking drops the active count and clears likedByMe for that user.
    const off = await like(false);
    assert.deepEqual(await off.json(), { count: 1, likedByMe: false });

    const state = await app.request(`/v1/coalition/feed/${VIDEO_ID}/likes`, {
        headers: authHeader(),
    });
    assert.equal(state.status, 200);
    assert.deepEqual(await state.json(), { count: 1, likedByMe: false });
});

/**
 * Every conversation in Blackout is a Matrix event in a canopy den — no feature
 * ships its own message store. `coalition_feed_comments` was the last one that
 * did, so the write path is retired and the read path is a labelled archive.
 */
test('coalition feed comments: writes are gone, reads stay as an archive', async () => {
    const write = await app.request(`/v1/coalition/feed/${VIDEO_ID}/comments`, {
        method: 'POST',
        headers: authHeader('comment-author'),
        body: JSON.stringify({ body: 'first comment' }),
    });
    assert.equal(write.status, 410);
    const gone = (await write.json()) as { code: string; message: string };
    assert.equal(gone.code, 'gone');
    // The error has to say where comments went, or it is just a dead end.
    assert.match(gone.message, /den/i);

    // Existing threads keep rendering rather than vanishing on deploy.
    const listed = await app.request(`/v1/coalition/feed/${VIDEO_ID}/comments`, {
        headers: authHeader(),
    });
    assert.equal(listed.status, 200);
    const body = (await listed.json()) as { comments: unknown[]; archived: boolean };
    assert.ok(Array.isArray(body.comments));
    assert.equal(body.archived, true);
});

test('coalition feed den: first writer wins, so simultaneous commenters share one den', async () => {
    const link = async (denRoomId: string) =>
        app.request(`/v1/coalition/feed/${VIDEO_ID}/den`, {
            method: 'POST',
            headers: authHeader('den-linker'),
            body: JSON.stringify({ denRoomId }),
        });

    const first = await link('!first-den:server');
    assert.equal(first.status, 201);
    const firstBody = (await first.json()) as {
        item: { discussionDenId: string };
        created: boolean;
    };
    assert.equal(firstBody.created, true);
    assert.equal(firstBody.item.discussionDenId, '!first-den:server');

    // The loser gets the winner's den back and should abandon the room it made.
    const second = await link('!second-den:server');
    assert.equal(second.status, 200);
    const secondBody = (await second.json()) as {
        item: { discussionDenId: string };
        created: boolean;
    };
    assert.equal(secondBody.created, false);
    assert.equal(secondBody.item.discussionDenId, '!first-den:server');
});

test('coalition feed den: linking requires auth and a real feed item', async () => {
    const noAuth = await app.request(`/v1/coalition/feed/${VIDEO_ID}/den`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ denRoomId: '!x:server' }),
    });
    assert.equal(noAuth.status, 401);

    const missing = await app.request('/v1/coalition/feed/does-not-exist/den', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ denRoomId: '!x:server' }),
    });
    assert.equal(missing.status, 404);
});

test('coalition feed engagement: reads are public (likedByMe false when signed out)', async () => {
    // Seed a like so the public count is non-zero.
    await app.request(`/v1/coalition/feed/${VIDEO_ID}/likes`, {
        method: 'POST',
        headers: authHeader('public-read-liker'),
        body: JSON.stringify({ active: true }),
    });

    const likes = await app.request(`/v1/coalition/feed/${VIDEO_ID}/likes`);
    assert.equal(likes.status, 200);
    const likeBody = (await likes.json()) as { count: number; likedByMe: boolean };
    assert.ok(likeBody.count >= 1);
    assert.equal(likeBody.likedByMe, false);

    const comments = await app.request(`/v1/coalition/feed/${VIDEO_ID}/comments`);
    assert.equal(comments.status, 200);
});

test('coalition feed engagement: writes require auth', async () => {
    const likeNoAuth = await app.request(`/v1/coalition/feed/${VIDEO_ID}/likes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active: true }),
    });
    assert.equal(likeNoAuth.status, 401);

    // Commenting no longer has an auth gate to fail: the endpoint is retired
    // outright, so it answers 410 before it ever looks at a caller.
    const commentNoAuth = await app.request(`/v1/coalition/feed/${VIDEO_ID}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: 'hi' }),
    });
    assert.equal(commentNoAuth.status, 410);
});

test('coalition feed engagement: unknown feed item returns 404', async () => {
    const like = await app.request('/v1/coalition/feed/does-not-exist/likes', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ active: true }),
    });
    assert.equal(like.status, 404);

    const comments = await app.request('/v1/coalition/feed/does-not-exist/comments', {
        headers: authHeader(),
    });
    assert.equal(comments.status, 404);
});
