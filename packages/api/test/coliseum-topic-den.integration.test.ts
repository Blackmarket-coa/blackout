import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_API_SKIP_LISTEN = process.env.BLACKOUT_API_SKIP_LISTEN ?? '1';
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

function authHeader(userId: string = 'den-test-user'): Record<string, string> {
    return { authorization: `Bearer ${signJwt(userId, 'coliseum', 600)}` };
}

async function createTopic(title: string): Promise<string> {
    const response = await app.request('/v1/coliseum/topics', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ title, seed: { kind: 'text' } }),
    });
    assert.equal(response.status, 201);
    const { topic } = (await response.json()) as { topic: { id: string } };
    return topic.id;
}

const link = (topicId: string, denRoomId: string, userId = 'den-test-user') =>
    app.request(`/v1/coliseum/topics/${topicId}/den`, {
        method: 'POST',
        headers: authHeader(userId),
        body: JSON.stringify({ denRoomId }),
    });

test('a topic starts with no discussion den — creation is lazy', async () => {
    const topicId = await createTopic('Lazy den topic');
    const response = await app.request(`/v1/coliseum/topics/${topicId}`, {
        headers: authHeader(),
    });
    const { topic } = (await response.json()) as { topic: { discussionDenId?: string } };
    // Minting a room for every throwaway topic would bury a canopy's channel
    // list; the den appears on the first comment instead.
    assert.equal(topic.discussionDenId, undefined);
});

test('linking a den attaches it to the topic', async () => {
    const topicId = await createTopic('Link a den');
    const response = await link(topicId, '!discussion:server');
    assert.equal(response.status, 201);
    const body = (await response.json()) as {
        topic: { discussionDenId: string };
        created: boolean;
    };
    assert.equal(body.created, true);
    assert.equal(body.topic.discussionDenId, '!discussion:server');
});

/**
 * The den is created client-side, so two people commenting at the same moment
 * can each mint a room. The first link is authoritative; the loser is told so
 * and abandons the room it just made, rather than the topic ending up with two
 * rival discussions.
 */
test('first writer wins when two commenters race', async () => {
    const topicId = await createTopic('Racing commenters');

    const first = await link(topicId, '!alice-den:server', 'alice');
    assert.equal(first.status, 201);

    const second = await link(topicId, '!bob-den:server', 'bob');
    assert.equal(second.status, 200);
    const body = (await second.json()) as {
        topic: { discussionDenId: string };
        created: boolean;
    };
    assert.equal(body.created, false);
    assert.equal(body.topic.discussionDenId, '!alice-den:server');

    // And the topic itself reflects the winner, not the last writer.
    const reread = await app.request(`/v1/coliseum/topics/${topicId}`, { headers: authHeader() });
    const { topic } = (await reread.json()) as { topic: { discussionDenId: string } };
    assert.equal(topic.discussionDenId, '!alice-den:server');
});

test('re-linking the same den is idempotent, not an error', async () => {
    const topicId = await createTopic('Idempotent link');
    await link(topicId, '!same-den:server');
    const again = await link(topicId, '!same-den:server');
    assert.equal(again.status, 200);
    const body = (await again.json()) as { created: boolean };
    assert.equal(body.created, false);
});

test('linking requires auth and a real topic', async () => {
    const topicId = await createTopic('Guarded');

    const noAuth = await app.request(`/v1/coliseum/topics/${topicId}/den`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ denRoomId: '!x:server' }),
    });
    assert.equal(noAuth.status, 401);

    const missing = await link('topic-does-not-exist', '!x:server');
    assert.equal(missing.status, 404);
});

test('a blank den id is rejected', async () => {
    const topicId = await createTopic('Blank den');
    const response = await link(topicId, '');
    assert.equal(response.status, 400);
});
