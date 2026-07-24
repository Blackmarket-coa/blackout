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

function auth(userId: string): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(userId, 'coliseum', 600)}`,
        'content-type': 'application/json',
    };
}

const VIDEO = { kind: 'video', mxc: 'mxc://server/knw123', durationMs: 120000 };

async function json(res: Response): Promise<Record<string, unknown>> {
    return (await res.json()) as Record<string, unknown>;
}

interface ArenaRecordResponse {
    reputation: { overall: { score: number } };
    record: {
        matchesWon: number;
        matchesDrawn: number;
        roundsWon: number;
        steelmansPassed: number;
        credibilityStrikes: number;
        briefsAuthored: number;
    };
}

async function reputationOf(userId: string): Promise<ArenaRecordResponse> {
    const res = await app.request(`/v1/reputation/${encodeURIComponent(userId)}`);
    assert.equal(res.status, 200);
    return (await res.json()) as ArenaRecordResponse;
}

test('verdict wires steelman/credibility reputation and archives a searchable brief', async () => {
    const red = 'knw-fighter-red';
    const blue = 'knw-fighter-blue';
    const proposition = 'Xylotherm reactors are safe.';

    // Callout → accept → live.
    const created = await app.request('/v1/coliseum/matches', {
        method: 'POST',
        headers: auth(red),
        body: JSON.stringify({ proposition, domain: 'business', opponentId: blue }),
    });
    assert.equal(created.status, 201);
    const matchId = ((await json(created)).match as { id: string }).id;
    const accepted = await app.request(`/v1/coliseum/matches/${matchId}/accept`, {
        method: 'POST',
        headers: auth(blue),
    });
    assert.equal(accepted.status, 200);

    // Round 0: red's steel-man. The crowd endorses it → steelman_passed.
    const steelman = await app.request(`/v1/coliseum/matches/${matchId}/rounds`, {
        method: 'POST',
        headers: auth(red),
        body: JSON.stringify({ kind: 'steelman', body: 'Your position is X', media: VIDEO }),
    });
    assert.equal(steelman.status, 201);
    for (const voter of ['knw-s1', 'knw-s2', 'knw-s3']) {
        const vote = await app.request(`/v1/coliseum/matches/${matchId}/rounds/0/vote`, {
            method: 'POST',
            headers: auth(voter),
            body: JSON.stringify({ choice: 'red' }),
        });
        assert.equal(vote.status, 201);
    }

    // Crucible: a lopsided evidence ruling against blue plus a decisive win.
    const opened = await app.request(`/v1/coliseum/matches/${matchId}/crucible/open`, {
        method: 'POST',
        headers: auth(red),
    });
    assert.equal(opened.status, 200);
    for (const voter of ['knw-s1', 'knw-s2', 'knw-s3', 'knw-s4', 'knw-s5']) {
        const vote = await app.request(`/v1/coliseum/matches/${matchId}/crucible/synthesis`, {
            method: 'POST',
            headers: auth(voter),
            body: JSON.stringify({ questionId: 'evidence', choice: 'red' }),
        });
        assert.equal(vote.status, 201);
    }
    for (const voter of ['knw-s1', 'knw-s2', 'knw-s3']) {
        const vote = await app.request(`/v1/coliseum/matches/${matchId}/crucible/synthesis`, {
            method: 'POST',
            headers: auth(voter),
            body: JSON.stringify({ questionId: 'decisive', choice: 'red' }),
        });
        assert.equal(vote.status, 201);
    }

    const verdict = await app.request(`/v1/coliseum/matches/${matchId}/verdict`, {
        method: 'POST',
        headers: auth(red),
    });
    assert.equal(verdict.status, 201);
    const brief = (await json(verdict)).brief as { id: string; winner: string };
    assert.equal(brief.winner, 'red');

    // The winner's record counts the win, the round, and the passed steel-man.
    const redRecord = (await reputationOf(red)).record;
    assert.equal(redRecord.matchesWon, 1);
    assert.equal(redRecord.roundsWon, 1);
    assert.equal(redRecord.steelmansPassed, 1);
    assert.equal(redRecord.credibilityStrikes, 0);
    assert.equal(redRecord.briefsAuthored, 1);

    // The lopsided evidence ruling strikes blue; the brief still counts as theirs.
    const blueRecord = (await reputationOf(blue)).record;
    assert.equal(blueRecord.matchesWon, 0);
    assert.equal(blueRecord.credibilityStrikes, 1);
    assert.equal(blueRecord.briefsAuthored, 1);

    // Minting again must not double-award (idempotent verdict).
    await app.request(`/v1/coliseum/matches/${matchId}/verdict`, {
        method: 'POST',
        headers: auth(red),
    });
    assert.equal((await reputationOf(red)).record.matchesWon, 1);

    // Briefs are queryable by domain and by free text, not just by fighter.
    const byDomain = (await json(await app.request('/v1/coliseum/briefs?domain=business'))) as {
        briefs: Array<{ id: string }>;
    };
    assert.ok(byDomain.briefs.some((b) => b.id === brief.id));
    const otherDomain = (await json(await app.request('/v1/coliseum/briefs?domain=tech'))) as {
        briefs: Array<{ id: string }>;
    };
    assert.ok(!otherDomain.briefs.some((b) => b.id === brief.id));
    const byText = (await json(await app.request('/v1/coliseum/briefs?q=xylotherm'))) as {
        briefs: Array<{ id: string }>;
    };
    assert.ok(byText.briefs.some((b) => b.id === brief.id));
    const badDomain = await app.request('/v1/coliseum/briefs?domain=not-a-domain');
    assert.equal(badDomain.status, 400);

    // The brief surfaces in global search as the `brief` knowledge type.
    const search = await app.request('/v1/search?q=xylotherm&types=brief');
    assert.equal(search.status, 200);
    const { results } = (await search.json()) as {
        results: Array<{ type: string; id: string; subtitle?: string }>;
    };
    const hit = results.find((r) => r.id === brief.id);
    assert.ok(hit, 'expected the brief in search results');
    assert.equal(hit!.type, 'brief');
    assert.equal(hit!.subtitle, 'business');
});
