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

function authHeader(sub = 'challenge-host'): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(sub, 'coliseum', 600)}`,
        'content-type': 'application/json',
    };
}

async function createChallenge(sub = 'challenge-host'): Promise<string> {
    const res = await app.request('/v1/coliseum/challenges', {
        method: 'POST',
        headers: authHeader(sub),
        body: JSON.stringify({ title: 'Start a business', category: 'business' }),
    });
    assert.equal(res.status, 201);
    return ((await res.json()) as { challenge: { id: string } }).challenge.id;
}

test('challenge: create → enter → vote → ranked results', async () => {
    const challengeId = await createChallenge();

    // Two entrants submit.
    const e1 = await app.request(`/v1/coliseum/challenges/${challengeId}/entries`, {
        method: 'POST',
        headers: authHeader('entrant-a'),
        body: JSON.stringify({ title: 'Mushroom farm' }),
    });
    assert.equal(e1.status, 201);
    const entryA = ((await e1.json()) as { entry: { id: string } }).entry.id;

    await app.request(`/v1/coliseum/challenges/${challengeId}/entries`, {
        method: 'POST',
        headers: authHeader('entrant-b'),
        body: JSON.stringify({ title: 'Bike repair co-op' }),
    });

    // Two distinct voters back entry A; a duplicate vote from one is idempotent.
    await app.request(`/v1/coliseum/challenges/entries/${entryA}/vote`, {
        method: 'POST',
        headers: authHeader('voter-1'),
    });
    await app.request(`/v1/coliseum/challenges/entries/${entryA}/vote`, {
        method: 'POST',
        headers: authHeader('voter-1'),
    }); // duplicate — must not double count
    const voted = await app.request(`/v1/coliseum/challenges/entries/${entryA}/vote`, {
        method: 'POST',
        headers: authHeader('voter-2'),
    });
    assert.equal(voted.status, 200);
    const { entries } = (await voted.json()) as {
        entries: Array<{ id: string; votes: number; rank: number }>;
    };
    const top = entries.find((e) => e.rank === 1);
    assert.equal(top?.id, entryA);
    assert.equal(top?.votes, 2, 'two distinct voters, duplicate ignored');
});

test('challenge: entries rejected once not open', async () => {
    const challengeId = await createChallenge();
    const closed = await app.request(`/v1/coliseum/challenges/${challengeId}`, {
        method: 'PATCH',
        headers: authHeader('challenge-host'),
        body: JSON.stringify({ status: 'closed' }),
    });
    assert.equal(closed.status, 200);

    const res = await app.request(`/v1/coliseum/challenges/${challengeId}/entries`, {
        method: 'POST',
        headers: authHeader('entrant-c'),
        body: JSON.stringify({ title: 'Too late' }),
    });
    assert.equal(res.status, 409);
});

test('challenge: only the creator can change status', async () => {
    const challengeId = await createChallenge('owner');
    const res = await app.request(`/v1/coliseum/challenges/${challengeId}`, {
        method: 'PATCH',
        headers: authHeader('intruder'),
        body: JSON.stringify({ status: 'judging' }),
    });
    assert.equal(res.status, 403);
});

test('challenge: write requires auth', async () => {
    const res = await app.request('/v1/coliseum/challenges', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Anon', category: 'other' }),
    });
    assert.equal(res.status, 401);
});

test('leaderboards: challenges category ranks by entry count; bad category 400', async () => {
    const res = await app.request('/v1/coliseum/leaderboards?category=challenges');
    assert.equal(res.status, 200);
    const { entries } = (await res.json()) as { entries: Array<{ score: number; rank: number }> };
    for (let i = 1; i < entries.length; i++) {
        assert.ok(entries[i - 1]!.score >= entries[i]!.score, 'score-descending');
    }

    const bad = await app.request('/v1/coliseum/leaderboards?category=bogus');
    assert.equal(bad.status, 400);
});
