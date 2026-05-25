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

function authHeader(userId: string = 'coliseum-test-user'): Record<string, string> {
    return { authorization: `Bearer ${signJwt(userId, 'coliseum', 600)}` };
}

test('coliseum topics returns ranked topics with debate heat', async () => {
    const response = await app.request('/v1/coliseum/topics', { headers: authHeader() });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
        topics: Array<{ id: string; debateHeat: number; status: string }>;
        generatedAt: string;
    };
    assert.ok(Array.isArray(body.topics));
    assert.ok(body.topics.length > 0);
    for (let i = 1; i < body.topics.length; i += 1) {
        assert.ok(body.topics[i - 1]!.debateHeat >= body.topics[i]!.debateHeat);
    }
});

test('coliseum topics filters by category', async () => {
    const response = await app.request('/v1/coliseum/topics?category=tech', {
        headers: authHeader(),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { topics: Array<{ category?: string }> };
    assert.ok(body.topics.length > 0);
    assert.ok(body.topics.every((t) => t.category === 'tech'));
});

test('coliseum topics rejects bad limit', async () => {
    const response = await app.request('/v1/coliseum/topics?limit=999', {
        headers: authHeader(),
    });
    assert.equal(response.status, 400);
});

test('coliseum topic detail returns the topic and its ranked arguments', async () => {
    const response = await app.request('/v1/coliseum/topics/topic-grid-resilience', {
        headers: authHeader(),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
        topic: { id: string };
        arguments: Array<{ id: string; score: number; stance: string }>;
    };
    assert.equal(body.topic.id, 'topic-grid-resilience');
    assert.ok(body.arguments.length >= 3);
    for (let i = 1; i < body.arguments.length; i += 1) {
        assert.ok(body.arguments[i - 1]!.score >= body.arguments[i]!.score);
    }
});

test('coliseum topic detail returns 404 for unknown topic', async () => {
    const response = await app.request('/v1/coliseum/topics/does-not-exist', {
        headers: authHeader(),
    });
    assert.equal(response.status, 404);
});

test('coliseum create topic requires auth', async () => {
    const response = await app.request('/v1/coliseum/topics', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
    });
    assert.equal(response.status, 401);
});

test('coliseum create topic accepts a valid topic', async () => {
    const response = await app.request('/v1/coliseum/topics', {
        method: 'POST',
        headers: { ...authHeader('curator'), 'content-type': 'application/json' },
        body: JSON.stringify({
            title: 'Should public broadcasters fund podcast networks?',
            newsAnchor: {
                sourceUrl: 'https://news.example/podcast-funding',
                headline: 'Public broadcaster pilots funding network indie podcasts',
                publishedAt: '2026-05-02T07:00:00Z',
            },
            tags: ['media', 'culture'],
            category: 'culture',
        }),
    });
    assert.equal(response.status, 201);
    const body = (await response.json()) as {
        topic: { id: string; status: string; debateHeat: number };
    };
    assert.ok(body.topic.id.startsWith('topic_'));
    assert.ok(body.topic.debateHeat >= 0);
});

test('coliseum create topic rejects bad newsAnchor', async () => {
    const response = await app.request('/v1/coliseum/topics', {
        method: 'POST',
        headers: { ...authHeader(), 'content-type': 'application/json' },
        body: JSON.stringify({
            title: 't',
            newsAnchor: { sourceUrl: 'not-a-url', headline: '', publishedAt: 'nope' },
            tags: [],
        }),
    });
    assert.equal(response.status, 400);
});

test('coliseum create argument requires auth', async () => {
    const response = await app.request('/v1/coliseum/arguments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
    });
    assert.equal(response.status, 401);
});

test('coliseum create argument accepts a valid argument and validates citations', async () => {
    const response = await app.request('/v1/coliseum/arguments', {
        method: 'POST',
        headers: { ...authHeader('@debater:server'), 'content-type': 'application/json' },
        body: JSON.stringify({
            topicId: 'topic-grid-resilience',
            stance: 'nuance',
            stanceWeight: 0.1,
            body: 'Compensate the seam: pay co-ops for last-mile, utilities for backbone.',
            citations: [
                { kind: 'live', roomId: '!grid-debate:server' },
                { kind: 'unknown', whatever: true }, // dropped by validateCitations
                { kind: 'article', sourceUrl: 'https://news.example/post', title: 'Seam pay' },
            ],
        }),
    });
    assert.equal(response.status, 201);
    const body = (await response.json()) as {
        argument: { id: string; citations: Array<{ kind: string }>; stance: string };
    };
    assert.ok(body.argument.id.startsWith('arg_'));
    assert.equal(body.argument.stance, 'nuance');
    assert.equal(body.argument.citations.length, 2);
    assert.deepEqual(
        body.argument.citations.map((c) => c.kind).sort(),
        ['article', 'live'],
    );
});

test('coliseum create argument accepts valid video media and drops malformed media', async () => {
    const good = await app.request('/v1/coliseum/arguments', {
        method: 'POST',
        headers: { ...authHeader('@reeler:server'), 'content-type': 'application/json' },
        body: JSON.stringify({
            topicId: 'topic-grid-resilience',
            stance: 'for',
            body: 'Watch the co-op crew restore feeders in real time.',
            media: { kind: 'video', mxc: 'mxc://server/abc123', durationMs: 18000 },
        }),
    });
    assert.equal(good.status, 201);
    const goodBody = (await good.json()) as {
        argument: { media?: { kind: string; mxc: string; durationMs?: number } };
    };
    assert.equal(goodBody.argument.media?.kind, 'video');
    assert.equal(goodBody.argument.media?.mxc, 'mxc://server/abc123');
    assert.equal(goodBody.argument.media?.durationMs, 18000);

    const bad = await app.request('/v1/coliseum/arguments', {
        method: 'POST',
        headers: { ...authHeader('@reeler:server'), 'content-type': 'application/json' },
        body: JSON.stringify({
            topicId: 'topic-grid-resilience',
            stance: 'for',
            body: 'Bad media should be dropped, not rejected.',
            media: { kind: 'video', mxc: 'not-an-mxc' },
        }),
    });
    assert.equal(bad.status, 201);
    const badBody = (await bad.json()) as { argument: { media?: unknown } };
    assert.equal(badBody.argument.media, undefined);
});

test('coliseum create argument 404s for unknown topic', async () => {
    const response = await app.request('/v1/coliseum/arguments', {
        method: 'POST',
        headers: { ...authHeader(), 'content-type': 'application/json' },
        body: JSON.stringify({
            topicId: 'nope',
            stance: 'for',
            body: 'x',
            citations: [],
        }),
    });
    assert.equal(response.status, 404);
});

test('coliseum vote requires auth', async () => {
    const response = await app.request('/v1/coliseum/arguments/arg-grid-1/vote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ direction: 'up' }),
    });
    assert.equal(response.status, 401);
});

test('coliseum vote accepts up/down and updates argument scores', async () => {
    const before = await app.request('/v1/coliseum/topics/topic-ai-licensing', {
        headers: authHeader(),
    });
    const beforeBody = (await before.json()) as {
        arguments: Array<{ id: string; voteScore: number }>;
    };
    const arg = beforeBody.arguments.find((a) => a.id === 'arg-ai-2');
    assert.ok(arg);
    const previous = arg!.voteScore;

    const vote = await app.request('/v1/coliseum/arguments/arg-ai-2/vote', {
        method: 'POST',
        headers: { ...authHeader('@up-voter:server'), 'content-type': 'application/json' },
        body: JSON.stringify({ direction: 'up' }),
    });
    assert.equal(vote.status, 201);
    const voteBody = (await vote.json()) as {
        vote: { direction: string };
        argument: { voteScore: number };
    };
    assert.equal(voteBody.vote.direction, 'up');
    assert.ok(voteBody.argument.voteScore >= previous);
});

test('coliseum vote 404s for unknown argument', async () => {
    const response = await app.request('/v1/coliseum/arguments/nope/vote', {
        method: 'POST',
        headers: { ...authHeader(), 'content-type': 'application/json' },
        body: JSON.stringify({ direction: 'up' }),
    });
    assert.equal(response.status, 404);
});

test('coliseum vote rejects bad direction', async () => {
    const response = await app.request('/v1/coliseum/arguments/arg-grid-1/vote', {
        method: 'POST',
        headers: { ...authHeader(), 'content-type': 'application/json' },
        body: JSON.stringify({ direction: 'sideways' }),
    });
    assert.equal(response.status, 400);
});

test('coliseum verdict returns winner + consensus diagnostic', async () => {
    const response = await app.request('/v1/coliseum/verdict/topic-grid-resilience', {
        headers: authHeader(),
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
        verdict: {
            topicId: string;
            winningArgumentId: string | null;
            runnersUp: string[];
            consensusArgumentIds: string[];
            model: string;
        };
    };
    assert.equal(body.verdict.topicId, 'topic-grid-resilience');
    assert.equal(body.verdict.model, 'coliseum_polis_v1');
    assert.ok(body.verdict.winningArgumentId);
});

test('coliseum verdict 404s for unknown topic', async () => {
    const response = await app.request('/v1/coliseum/verdict/does-not-exist', {
        headers: authHeader(),
    });
    assert.equal(response.status, 404);
});
