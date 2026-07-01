import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.BLACKOUT_API_SKIP_LISTEN = process.env.BLACKOUT_API_SKIP_LISTEN ?? '1';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'wss://livekit.local';
process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? 'lk_test_key';
process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? 'lk_test_secret';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');

function auth(userId: string): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(userId, 'coliseum', 600)}`,
        'content-type': 'application/json',
    };
}

async function json(res: Response): Promise<Record<string, unknown>> {
    return (await res.json()) as Record<string, unknown>;
}

async function position(matchId: string, voter: string, agree: boolean, certain: boolean) {
    return app.request(`/v1/coliseum/matches/${matchId}/position`, {
        method: 'POST',
        headers: auth(voter),
        body: JSON.stringify({ agree, certain }),
    });
}

test('position map moves the crowd and produces a non-zero Shift Score', async () => {
    const created = await app.request('/v1/coliseum/matches', {
        method: 'POST',
        headers: auth('pos-red'),
        body: JSON.stringify({
            proposition: 'AI will replace juniors',
            domain: 'tech',
            opponentId: 'pos-blue',
        }),
    });
    const { match } = (await json(created)) as { match: { id: string } };
    const matchId = match.id;
    await app.request(`/v1/coliseum/matches/${matchId}/accept`, {
        method: 'POST',
        headers: auth('pos-blue'),
    });

    // Fighters cannot place themselves on the crowd map.
    const fighterPlace = await position(matchId, 'pos-red', true, true);
    assert.equal(fighterPlace.status, 403);

    // First spectator agrees & is certain → captures the start snapshot.
    const first = await position(matchId, 's1', true, true);
    assert.equal(first.status, 201);
    assert.deepEqual((await json(first)).position, { agreeShare: 1, certainty: 1, sampleSize: 1 });

    // The crowd then swings to disagree/uncertain.
    await position(matchId, 's2', false, false);
    await position(matchId, 's3', false, false);

    const snap = (await json(await app.request(`/v1/coliseum/matches/${matchId}/position`))) as {
        position: { agreeShare: number; sampleSize: number };
    };
    assert.equal(snap.position.sampleSize, 3);
    assert.ok(snap.position.agreeShare < 0.5);

    // Close it out; the Brief's Shift Score reflects the movement.
    await app.request(`/v1/coliseum/matches/${matchId}/crucible/open`, {
        method: 'POST',
        headers: auth('pos-red'),
    });
    const verdict = await app.request(`/v1/coliseum/matches/${matchId}/verdict`, {
        method: 'POST',
        headers: auth('pos-red'),
    });
    const { brief } = (await json(verdict)) as { brief: { shiftScore: number } };
    assert.ok(brief.shiftScore > 0, `expected a non-zero shift score, got ${brief.shiftScore}`);
});

test('position vote is rejected before the match is live', async () => {
    const created = await app.request('/v1/coliseum/matches', {
        method: 'POST',
        headers: auth('pos-red-2'),
        body: JSON.stringify({ proposition: 'Pending match', opponentId: 'pos-blue-2' }),
    });
    const { match } = (await json(created)) as { match: { id: string } };
    const res = await position(match.id, 'spectator', true, true);
    assert.equal(res.status, 403);
});
