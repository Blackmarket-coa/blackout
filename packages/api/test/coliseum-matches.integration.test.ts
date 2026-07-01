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

const VIDEO = { kind: 'video', mxc: 'mxc://server/abc123', durationMs: 120000 };

async function json(res: Response): Promise<Record<string, unknown>> {
    return (await res.json()) as Record<string, unknown>;
}

test('full match lifecycle: callout → accept → rounds → crucible → verdict → brief', async () => {
    const challenger = 'fighter-red';
    const opponent = 'fighter-blue';

    // 1. Issue a Callout.
    const created = await app.request('/v1/coliseum/matches', {
        method: 'POST',
        headers: auth(challenger),
        body: JSON.stringify({
            proposition: 'Remote work is dead.',
            domain: 'business',
            opponentId: opponent,
        }),
    });
    assert.equal(created.status, 201);
    const { match } = (await json(created)) as { match: { id: string; status: string } };
    assert.equal(match.status, 'pending');
    const matchId = match.id;

    // 2. Opponent accepts → live.
    const accepted = await app.request(`/v1/coliseum/matches/${matchId}/accept`, {
        method: 'POST',
        headers: auth(opponent),
    });
    assert.equal(accepted.status, 200);
    assert.equal(((await json(accepted)).match as { status: string }).status, 'live');

    // 3. Steel-man gate: a rebuttal before a steel-man is rejected.
    const earlyRebuttal = await app.request(`/v1/coliseum/matches/${matchId}/rounds`, {
        method: 'POST',
        headers: auth(challenger),
        body: JSON.stringify({ kind: 'rebuttal', body: 'You are wrong', media: VIDEO }),
    });
    assert.equal(earlyRebuttal.status, 409);

    // Steel-man first, then rebuttal succeeds.
    const steelman = await app.request(`/v1/coliseum/matches/${matchId}/rounds`, {
        method: 'POST',
        headers: auth(challenger),
        body: JSON.stringify({ kind: 'steelman', body: 'Your position is X', media: VIDEO }),
    });
    assert.equal(steelman.status, 201);
    const rebuttal = await app.request(`/v1/coliseum/matches/${matchId}/rounds`, {
        method: 'POST',
        headers: auth(challenger),
        body: JSON.stringify({ kind: 'rebuttal', body: 'But X fails', media: VIDEO }),
    });
    assert.equal(rebuttal.status, 201);

    // 3b. 3-minute cap is enforced.
    const tooLong = await app.request(`/v1/coliseum/matches/${matchId}/rounds`, {
        method: 'POST',
        headers: auth(opponent),
        body: JSON.stringify({
            kind: 'opening',
            media: { kind: 'video', mxc: 'mxc://s/x', durationMs: 200000 },
        }),
    });
    assert.equal(tooLong.status, 400);

    // 4. Spectators vote on round 0; fighters cannot.
    const fighterVote = await app.request(`/v1/coliseum/matches/${matchId}/rounds/0/vote`, {
        method: 'POST',
        headers: auth(opponent),
        body: JSON.stringify({ choice: 'red' }),
    });
    assert.equal(fighterVote.status, 403);
    for (const voter of ['s1', 's2', 's3']) {
        const v = await app.request(`/v1/coliseum/matches/${matchId}/rounds/0/vote`, {
            method: 'POST',
            headers: auth(voter),
            body: JSON.stringify({ choice: 'red' }),
        });
        assert.equal(v.status, 201);
    }

    // 5. Fighters argue blind: tallies are withheld from a fighter.
    const fighterView = await json(
        await app.request(`/v1/coliseum/matches/${matchId}`, { headers: auth(challenger) })
    );
    assert.equal(fighterView.tallies, undefined);
    const spectatorView = await json(
        await app.request(`/v1/coliseum/matches/${matchId}`, { headers: auth('s1') })
    );
    assert.ok(Array.isArray(spectatorView.tallies));

    // 6. Open the Crucible, cast synthesis votes.
    const opened = await app.request(`/v1/coliseum/matches/${matchId}/crucible/open`, {
        method: 'POST',
        headers: auth(challenger),
    });
    assert.equal(opened.status, 200);
    assert.equal(((await json(opened)).match as { status: string }).status, 'crucible');

    for (const voter of ['s1', 's2', 's3']) {
        const sv = await app.request(`/v1/coliseum/matches/${matchId}/crucible/synthesis`, {
            method: 'POST',
            headers: auth(voter),
            body: JSON.stringify({ questionId: 'decisive', choice: 'red' }),
        });
        assert.equal(sv.status, 201);
    }

    // 7. Mint the verdict + brief.
    const verdict = await app.request(`/v1/coliseum/matches/${matchId}/verdict`, {
        method: 'POST',
        headers: auth(challenger),
    });
    assert.equal(verdict.status, 201);
    const { brief } = (await json(verdict)) as {
        brief: { id: string; winner: string; proposition: string };
    };
    assert.equal(brief.winner, 'red');
    assert.equal(brief.proposition, 'Remote work is dead.');

    // 8. Brief is public and shows on the fighter's brief list.
    const briefRes = await app.request(`/v1/coliseum/briefs/${brief.id}`);
    assert.equal(briefRes.status, 200);
    const fighterBriefs = (await json(
        await app.request(`/v1/coliseum/briefs?fighter=${encodeURIComponent(challenger)}`)
    )) as { briefs: Array<{ id: string }> };
    assert.ok(fighterBriefs.briefs.some((b) => b.id === brief.id));

    // 9. Cool-down: the winner cannot immediately start a new match.
    const blocked = await app.request('/v1/coliseum/matches', {
        method: 'POST',
        headers: auth(challenger),
        body: JSON.stringify({ proposition: 'Another fight now', opponentId: 'someone' }),
    });
    assert.equal(blocked.status, 409);
    assert.equal((await json(blocked)).code, 'cooldown');
});

test('challenge link exposes a public dodge status', async () => {
    const created = await app.request('/v1/coliseum/matches', {
        method: 'POST',
        headers: auth('caller-1'),
        body: JSON.stringify({ proposition: 'Prove me wrong', opponentId: 'target-1' }),
    });
    const { match } = (await json(created)) as { match: { id: string } };

    const link1 = (await json(await app.request(`/v1/coliseum/matches/${match.id}/link`))) as {
        status: string;
        token: string;
    };
    assert.equal(link1.status, 'pending');
    assert.ok(link1.token);

    // Opening the link records a "seen" ping (the dodge).
    await app.request(`/v1/coliseum/matches/${match.id}/seen`, { method: 'POST' });
    const link2 = (await json(await app.request(`/v1/coliseum/matches/${match.id}/link`))) as {
        status: string;
    };
    assert.equal(link2.status, 'seen');
});

test('shout pipeline: shout → drops → bilateral → graduate to match', async () => {
    const shouter = 'shouter-1';
    const responder = 'responder-1';

    const shoutRes = await app.request('/v1/coliseum/shouts', {
        method: 'POST',
        headers: auth(shouter),
        body: JSON.stringify({ body: 'The market is overheated', domain: 'finance', media: VIDEO }),
    });
    assert.equal(shoutRes.status, 201);
    const { shout } = (await json(shoutRes)) as { shout: { id: string } };

    // Responder drops a reply; shouter replies back → bilateral.
    await app.request(`/v1/coliseum/shouts/${shout.id}/drops`, {
        method: 'POST',
        headers: auth(responder),
        body: JSON.stringify({ body: 'No it is not', media: VIDEO }),
    });
    await app.request(`/v1/coliseum/shouts/${shout.id}/drops`, {
        method: 'POST',
        headers: auth(shouter),
        body: JSON.stringify({ body: 'Yes it is, here is why', media: VIDEO }),
    });

    const detail = (await json(await app.request(`/v1/coliseum/shouts/${shout.id}`))) as {
        bilateral: unknown;
        drops: unknown[];
    };
    assert.ok(detail.bilateral, 'expected a bilateral exchange to be detected');
    assert.equal(detail.drops.length, 2);

    const graduated = await app.request(`/v1/coliseum/shouts/${shout.id}/graduate`, {
        method: 'POST',
        headers: auth(shouter),
    });
    assert.equal(graduated.status, 201);
    const { match } = (await json(graduated)) as { match: { status: string; shoutId: string } };
    assert.equal(match.status, 'live');
    assert.equal(match.shoutId, shout.id);
});

test('issuing a callout requires auth', async () => {
    const res = await app.request('/v1/coliseum/matches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proposition: 'x' }),
    });
    assert.equal(res.status, 401);
});
