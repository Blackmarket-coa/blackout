import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_API_SKIP_LISTEN = process.env.BLACKOUT_API_SKIP_LISTEN ?? '1';
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

function authHeader(userId: string): Record<string, string> {
    return { authorization: `Bearer ${signJwt(userId, userId, 600)}` };
}

const json = { 'content-type': 'application/json' };

// Each session is idempotent per topic, so every test seeds its own topic to
// get an isolated session.
async function freshTopic(moderator: string): Promise<string> {
    const response = await app.request('/v1/coliseum/topics', {
        method: 'POST',
        headers: { ...authHeader(moderator), ...json },
        body: JSON.stringify({
            title: `Live debate topic ${Math.random().toString(36).slice(2)}`,
            newsAnchor: {
                sourceUrl: 'https://news.example/live',
                headline: 'A live debate kicks off',
                publishedAt: '2026-05-02T07:00:00Z',
            },
            tags: ['live'],
        }),
    });
    assert.equal(response.status, 201);
    return ((await response.json()) as { topic: { id: string } }).topic.id;
}

async function startSession(moderator: string, topicId?: string): Promise<string> {
    const tid = topicId ?? (await freshTopic(moderator));
    const response = await app.request('/v1/coliseum/live/sessions', {
        method: 'POST',
        headers: { ...authHeader(moderator), ...json },
        body: JSON.stringify({ topicId: tid, roomId: '!grid-live:server' }),
    });
    assert.equal(response.status, 201);
    const body = (await response.json()) as {
        session: { id: string; topicId: string; moderatorIds: string[] };
    };
    assert.ok(body.session.moderatorIds.includes(moderator));
    return body.session.id;
}

test('live session creation requires auth', async () => {
    const response = await app.request('/v1/coliseum/live/sessions', {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ topicId: 'topic-grid-resilience', roomId: '!x:server' }),
    });
    assert.equal(response.status, 401);
});

test('live session creation rejects an invalid room id', async () => {
    const response = await app.request('/v1/coliseum/live/sessions', {
        method: 'POST',
        headers: { ...authHeader('@mod-a:server'), ...json },
        body: JSON.stringify({ topicId: 'topic-grid-resilience', roomId: 'not-a-room' }),
    });
    assert.equal(response.status, 400);
});

test('live session creation 404s for an unknown topic', async () => {
    const response = await app.request('/v1/coliseum/live/sessions', {
        method: 'POST',
        headers: { ...authHeader('@mod-a:server'), ...json },
        body: JSON.stringify({ topicId: 'nope', roomId: '!x:server' }),
    });
    assert.equal(response.status, 404);
});

test('creator becomes moderator; request -> grant flow mutates the queue', async () => {
    const sessionId = await startSession('@mod-grid:server');

    // A non-moderator requests to speak.
    const requested = await app.request(`/v1/coliseum/live/sessions/${sessionId}/speak`, {
        method: 'POST',
        headers: { ...authHeader('@speaker:server'), ...json },
    });
    assert.equal(requested.status, 200);
    const requestedBody = (await requested.json()) as {
        session: { speakingQueue: Array<{ userId: string; state: string }> };
    };
    assert.equal(requestedBody.session.speakingQueue[0]!.userId, '@speaker:server');
    assert.equal(requestedBody.session.speakingQueue[0]!.state, 'requested');

    // Non-moderator cannot grant.
    const forbidden = await app.request(
        `/v1/coliseum/live/sessions/${sessionId}/speak/@speaker:server/grant`,
        { method: 'POST', headers: { ...authHeader('@speaker:server'), ...json } },
    );
    assert.equal(forbidden.status, 403);

    // Moderator grants.
    const granted = await app.request(
        `/v1/coliseum/live/sessions/${sessionId}/speak/@speaker:server/grant`,
        { method: 'POST', headers: { ...authHeader('@mod-grid:server'), ...json } },
    );
    assert.equal(granted.status, 200);
    const grantedBody = (await granted.json()) as {
        session: { speakingQueue: Array<{ userId: string; state: string }> };
    };
    assert.equal(
        grantedBody.session.speakingQueue.find((s) => s.userId === '@speaker:server')!.state,
        'granted',
    );
});

test('token endpoint grants publish to moderators/speakers and subscribe-only to audience', async () => {
    const sessionId = await startSession('@mod-tok:server');
    await app.request(`/v1/coliseum/live/sessions/${sessionId}/speak`, {
        method: 'POST',
        headers: { ...authHeader('@granted:server'), ...json },
    });
    await app.request(`/v1/coliseum/live/sessions/${sessionId}/speak/@granted:server/grant`, {
        method: 'POST',
        headers: { ...authHeader('@mod-tok:server'), ...json },
    });

    const modToken = await app.request(`/v1/coliseum/live/sessions/${sessionId}/token`, {
        method: 'POST',
        headers: { ...authHeader('@mod-tok:server'), ...json },
    });
    assert.equal(modToken.status, 200);
    assert.equal(((await modToken.json()) as { canPublish: boolean }).canPublish, true);

    const speakerToken = await app.request(`/v1/coliseum/live/sessions/${sessionId}/token`, {
        method: 'POST',
        headers: { ...authHeader('@granted:server'), ...json },
    });
    assert.equal(((await speakerToken.json()) as { canPublish: boolean }).canPublish, true);

    const audienceToken = await app.request(`/v1/coliseum/live/sessions/${sessionId}/token`, {
        method: 'POST',
        headers: { ...authHeader('@lurker:server'), ...json },
    });
    const audienceBody = (await audienceToken.json()) as { canPublish: boolean; token: string };
    assert.equal(audienceBody.canPublish, false);
    assert.ok(audienceBody.token.length > 0);
});

test('moderator can pin valid evidence; bad evidence is rejected', async () => {
    const sessionId = await startSession('@mod-pin:server');

    const pinned = await app.request(`/v1/coliseum/live/sessions/${sessionId}/pin`, {
        method: 'POST',
        headers: { ...authHeader('@mod-pin:server'), ...json },
        body: JSON.stringify({ argumentId: 'arg-grid-1' }),
    });
    assert.equal(pinned.status, 200);
    const pinnedBody = (await pinned.json()) as {
        session: { pinnedEvidence: Array<{ kind: string }> };
    };
    assert.equal(pinnedBody.session.pinnedEvidence[0]!.kind, 'argument');

    const badArg = await app.request(`/v1/coliseum/live/sessions/${sessionId}/pin`, {
        method: 'POST',
        headers: { ...authHeader('@mod-pin:server'), ...json },
        body: JSON.stringify({ argumentId: 'does-not-exist' }),
    });
    assert.equal(badArg.status, 400);

    const nonMod = await app.request(`/v1/coliseum/live/sessions/${sessionId}/pin`, {
        method: 'POST',
        headers: { ...authHeader('@rando:server'), ...json },
        body: JSON.stringify({ argumentId: 'arg-grid-1' }),
    });
    assert.equal(nonMod.status, 403);
});

test('ending a session is moderator-gated and clears the active session', async () => {
    const topicId = await freshTopic('@mod-end:server');
    const sessionId = await startSession('@mod-end:server', topicId);

    const forbidden = await app.request(`/v1/coliseum/live/sessions/${sessionId}/end`, {
        method: 'POST',
        headers: { ...authHeader('@rando:server'), ...json },
    });
    assert.equal(forbidden.status, 403);

    const ended = await app.request(`/v1/coliseum/live/sessions/${sessionId}/end`, {
        method: 'POST',
        headers: { ...authHeader('@mod-end:server'), ...json },
    });
    assert.equal(ended.status, 200);
    assert.equal(((await ended.json()) as { session: { status: string } }).session.status, 'ended');

    const active = await app.request(`/v1/coliseum/live/sessions/${topicId}`, {
        headers: authHeader('@anyone:server'),
    });
    assert.equal(((await active.json()) as { session: unknown }).session, null);
});
