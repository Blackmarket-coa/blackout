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

interface KnowledgeEntry {
    id: string;
    kind: string;
    title: string;
    domain?: string;
    summary: string;
    authorIds: string[];
    insightScore: number;
    verdictConfidence: number;
}

async function knowledge(query: string): Promise<KnowledgeEntry[]> {
    const res = await app.request(`/v1/coliseum/knowledge${query}`);
    assert.equal(res.status, 200);
    return ((await res.json()) as { entries: KnowledgeEntry[] }).entries;
}

test('unified knowledge repository archives briefs and resolved topic debates', async () => {
    const author = 'knw-deb-author';
    const rival = 'knw-deb-rival';
    const now = Date.now();

    // A topic whose voting window has already closed → status 'closing',
    // i.e. resolved enough to archive.
    const createdTopic = await app.request('/v1/coliseum/topics', {
        method: 'POST',
        headers: auth(author),
        body: JSON.stringify({
            title: 'Should Quorlith Bay ban gill nets?',
            category: 'science',
            tags: ['fisheries'],
            closesAt: new Date(now - 60_000).toISOString(),
            newsAnchor: {
                sourceUrl: 'https://news.example/quorlith',
                headline: 'Quorlith Bay fish stocks collapse',
                publishedAt: new Date(now - 3_600_000).toISOString(),
            },
        }),
    });
    assert.equal(createdTopic.status, 201);
    const topicId = ((await json(createdTopic)).topic as { id: string }).id;

    // A sourced argument plus a cross-stance rebuttal, then crowd votes.
    const argRes = await app.request('/v1/coliseum/arguments', {
        method: 'POST',
        headers: auth(author),
        body: JSON.stringify({
            topicId,
            stance: 'for',
            body: 'Ban gill nets — bycatch collapsed the herring run.',
            citations: [
                {
                    kind: 'article',
                    sourceUrl: 'https://news.example/quorlith',
                    title: 'Quorlith Bay fish stocks collapse',
                },
            ],
        }),
    });
    assert.equal(argRes.status, 201);
    const argumentId = ((await json(argRes)).argument as { id: string }).id;
    const rebuttal = await app.request('/v1/coliseum/arguments', {
        method: 'POST',
        headers: auth(rival),
        body: JSON.stringify({
            topicId,
            parentArgumentId: argumentId,
            stance: 'against',
            body: 'A ban strands the small-boat fleet with no transition plan.',
        }),
    });
    assert.equal(rebuttal.status, 201);
    for (const voter of ['knw-d1', 'knw-d2', 'knw-d3']) {
        const vote = await app.request(
            `/v1/coliseum/arguments/${encodeURIComponent(argumentId)}/vote`,
            {
                method: 'POST',
                headers: auth(voter),
                body: JSON.stringify({ direction: 'up' }),
            }
        );
        assert.equal(vote.status, 201);
    }

    // The resolved debate surfaces as a `debate_verdict` knowledge entry…
    const entries = await knowledge('?q=quorlith');
    const debateEntry = entries.find((e) => e.id === `debate:${topicId}`);
    assert.ok(debateEntry, 'expected the resolved debate in the knowledge feed');
    assert.equal(debateEntry!.kind, 'debate_verdict');
    assert.equal(debateEntry!.domain, 'science');
    assert.deepEqual(debateEntry!.authorIds, [author]);
    assert.ok(debateEntry!.verdictConfidence > 0);
    assert.ok(debateEntry!.summary.startsWith('Winner:'));

    // …alongside the match brief minted in the earlier test.
    const briefEntries = await knowledge('?kind=brief&q=xylotherm');
    assert.ok(briefEntries.length >= 1, 'expected the xylotherm brief as a knowledge entry');
    assert.ok(briefEntries.every((e) => e.kind === 'brief'));

    // Domain + kind filters compose; text search is scoped by them.
    const scienceOnly = await knowledge('?domain=science&q=quorlith');
    assert.ok(scienceOnly.some((e) => e.id === `debate:${topicId}`));
    const businessOnly = await knowledge('?domain=business&q=quorlith');
    assert.equal(businessOnly.length, 0);
    const kindScoped = await knowledge('?kind=brief&q=quorlith');
    assert.ok(!kindScoped.some((e) => e.id === `debate:${topicId}`));

    // Ranking is insight-ordered, not insertion-ordered.
    const all = await knowledge('');
    for (let i = 1; i < all.length; i++) {
        assert.ok(
            all[i - 1]!.insightScore >= all[i]!.insightScore,
            'knowledge entries must rank by insight score'
        );
    }

    const badDomain = await app.request('/v1/coliseum/knowledge?domain=not-a-domain');
    assert.equal(badDomain.status, 400);
    const badKind = await app.request('/v1/coliseum/knowledge?kind=not-a-kind');
    assert.equal(badKind.status, 400);
});

test('explainers publish into the knowledge repository and endorsements build confidence', async () => {
    const author = 'knw-exp-author';

    const unauthenticated = await app.request('/v1/coliseum/knowledge/explainers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'x', body: 'y' }),
    });
    assert.equal(unauthenticated.status, 401);

    const created = await app.request('/v1/coliseum/knowledge/explainers', {
        method: 'POST',
        headers: auth(author),
        body: JSON.stringify({
            title: 'How the Vrellik battery recycling loop works',
            body: 'Vrellik cells are smelted in three stages; the slag is reused as ballast.',
            domain: 'science',
            tags: ['batteries', 'recycling'],
            citations: [
                {
                    kind: 'article',
                    sourceUrl: 'https://news.example/vrellik',
                    title: 'Inside the Vrellik loop',
                },
            ],
            counterpoints: [
                'Smelting is energy-intensive; critics argue direct reuse beats recycling.',
            ],
        }),
    });
    assert.equal(created.status, 201);
    const explainer = (await json(created)).explainer as {
        id: string;
        upVotes: number;
        citations: unknown[];
        counterpoints: string[];
    };
    assert.equal(explainer.upVotes, 0);
    assert.equal(explainer.citations.length, 1);
    assert.equal(explainer.counterpoints.length, 1);

    // Publishing alone surfaces it, ranked on sourcing + steel-manning only.
    const entries = await knowledge('?kind=explainer&q=vrellik');
    const entry = entries.find((e) => e.id === `explainer:${explainer.id}`);
    assert.ok(entry, 'expected the explainer in the knowledge feed');
    assert.equal(entry!.kind, 'explainer');
    assert.equal(entry!.domain, 'science');
    assert.deepEqual(entry!.authorIds, [author]);
    assert.equal(entry!.verdictConfidence, 0);
    const preVoteInsight = entry!.insightScore;

    // Endorsements lift confidence; a repeated vote is not double-counted.
    for (const voter of ['knw-e1', 'knw-e2', 'knw-e3']) {
        const vote = await app.request(`/v1/coliseum/knowledge/explainers/${explainer.id}/vote`, {
            method: 'POST',
            headers: auth(voter),
            body: JSON.stringify({ direction: 'up' }),
        });
        assert.equal(vote.status, 201);
    }
    const repeated = await app.request(`/v1/coliseum/knowledge/explainers/${explainer.id}/vote`, {
        method: 'POST',
        headers: auth('knw-e1'),
        body: JSON.stringify({ direction: 'up' }),
    });
    const repeatedBody = (await json(repeated)).explainer as {
        upVotes: number;
        downVotes: number;
    };
    assert.equal(repeatedBody.upVotes, 3);
    assert.equal(repeatedBody.downVotes, 0);

    const endorsed = await knowledge('?kind=explainer&q=vrellik');
    const endorsedEntry = endorsed.find((e) => e.id === `explainer:${explainer.id}`)!;
    assert.ok(endorsedEntry.verdictConfidence > 0);
    assert.ok(endorsedEntry.insightScore > preVoteInsight);

    // Voting a missing explainer 404s; malformed payloads 400.
    const missing = await app.request('/v1/coliseum/knowledge/explainers/nope/vote', {
        method: 'POST',
        headers: auth(author),
        body: JSON.stringify({ direction: 'up' }),
    });
    assert.equal(missing.status, 404);
    const badBody = await app.request('/v1/coliseum/knowledge/explainers', {
        method: 'POST',
        headers: auth(author),
        body: JSON.stringify({ title: '', body: 'y' }),
    });
    assert.equal(badBody.status, 400);
});
