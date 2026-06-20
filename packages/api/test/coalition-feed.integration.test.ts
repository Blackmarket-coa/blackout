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

test('coalition feed comments: create returns 201 and lists newest-first', async () => {
    const post = async (body: string) =>
        app.request(`/v1/coalition/feed/${VIDEO_ID}/comments`, {
            method: 'POST',
            headers: authHeader('comment-author'),
            body: JSON.stringify({ body }),
        });

    const a = await post('first comment');
    assert.equal(a.status, 201);
    const { comment } = (await a.json()) as { comment: { authorId: string; body: string } };
    assert.equal(comment.authorId, 'comment-author');
    assert.equal(comment.body, 'first comment');

    await post('second comment');

    const listed = await app.request(`/v1/coalition/feed/${VIDEO_ID}/comments`, {
        headers: authHeader(),
    });
    assert.equal(listed.status, 200);
    const { comments } = (await listed.json()) as { comments: Array<{ body: string }> };
    assert.ok(comments.length >= 2);
    // Newest-first ordering.
    assert.equal(comments[0].body, 'second comment');
});

test('coalition feed engagement: writes require auth', async () => {
    const likeNoAuth = await app.request(`/v1/coalition/feed/${VIDEO_ID}/likes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active: true }),
    });
    assert.equal(likeNoAuth.status, 401);

    const commentNoAuth = await app.request(`/v1/coalition/feed/${VIDEO_ID}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: 'hi' }),
    });
    assert.equal(commentNoAuth.status, 401);
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
