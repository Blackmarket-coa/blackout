import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_API_SKIP_LISTEN = process.env.BLACKOUT_API_SKIP_LISTEN ?? '1';
// Use the in-memory store so each run seeds the Coliseum (and its endorsement
// reputation) fresh, instead of hydrating a shared on-disk file from a prior
// file-mode test in the same suite.
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

function authHeader(userId: string): Record<string, string> {
    return { authorization: `Bearer ${signJwt(userId, 'reputation', 600)}` };
}

interface ReputationResponse {
    userId: string;
    reputation: {
        overall: { score: number; tier: string };
        bySubject: Record<string, { score: number; tier: string }>;
    };
}

test('reputation reflects seeded debate endorsements by subject', async () => {
    const response = await app.request('/v1/reputation/@vine:server');
    assert.equal(response.status, 200);
    const body = (await response.json()) as ReputationResponse;
    // @vine:server authored a winning argument on a 'politics' topic that drew
    // seeded up-votes, so they hold positive politics-subject reputation.
    assert.ok(body.reputation.overall.score >= 2);
    assert.ok(body.reputation.bySubject.politics);
    assert.ok(body.reputation.bySubject.politics!.score >= 2);
});

test('an up-vote credits the author by subject, idempotently', async () => {
    const before = (await (await app.request('/v1/reputation/@scribe:server')).json()) as ReputationResponse;
    const beforeTech = before.reputation.bySubject.tech?.score ?? 0;

    // arg-ai-1 (author @scribe:server) lives on a 'tech' topic.
    const vote = await app.request('/v1/coliseum/arguments/arg-ai-1/vote', {
        method: 'POST',
        headers: { ...authHeader('@fresh-voter:server'), 'content-type': 'application/json' },
        body: JSON.stringify({ direction: 'up' }),
    });
    assert.equal(vote.status, 201);

    const after = (await (await app.request('/v1/reputation/@scribe:server')).json()) as ReputationResponse;
    assert.equal(after.reputation.bySubject.tech!.score, beforeTech + 2);

    // Re-voting up from the same voter must not inflate reputation again.
    await app.request('/v1/coliseum/arguments/arg-ai-1/vote', {
        method: 'POST',
        headers: { ...authHeader('@fresh-voter:server'), 'content-type': 'application/json' },
        body: JSON.stringify({ direction: 'up' }),
    });
    const again = (await (await app.request('/v1/reputation/@scribe:server')).json()) as ReputationResponse;
    assert.equal(again.reputation.bySubject.tech!.score, beforeTech + 2);
});

test('unknown user has empty reputation', async () => {
    const response = await app.request('/v1/reputation/@nobody:server');
    assert.equal(response.status, 200);
    const body = (await response.json()) as ReputationResponse;
    assert.equal(body.reputation.overall.score, 0);
    assert.deepEqual(body.reputation.bySubject, {});
});
