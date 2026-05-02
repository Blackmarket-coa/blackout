import test from 'node:test';
import assert from 'node:assert/strict';

import {
    COLISEUM_CITATION_KINDS,
    COLISEUM_STANCES,
    COLISEUM_TABS,
    COLISEUM_TOPIC_CATEGORY_KEYS,
    DEFAULT_COLISEUM_TAB,
    DEFAULT_COLISEUM_WEIGHTS,
    buildVoteMatrix,
    citationDepthScore,
    computeConsensus,
    computeTopicHeat,
    deriveColiseumTopicStatus,
    deriveColiseumWinnerVerdict,
    isValidCitationKind,
    isValidColiseumTab,
    kmeansCluster,
    normalizeColiseumCategoryKey,
    normalizeColiseumCategoryKeys,
    normalizeColiseumTopic,
    rankColiseumArguments,
    rankColiseumTopics,
    resolveEnabledColiseumTabs,
    scoreColiseumArgument,
    validateCitation,
    validateCitations,
    wilsonLowerBound,
    type ColiseumArgument,
    type ColiseumVote,
} from '@blackout/core';

const NOW = Date.parse('2026-05-02T12:00:00Z');

test('normalizeColiseumCategoryKey resolves aliases', () => {
    assert.equal(normalizeColiseumCategoryKey('political'), 'politics');
    assert.equal(normalizeColiseumCategoryKey('TECHNOLOGY'), 'tech');
    assert.equal(normalizeColiseumCategoryKey('  finance '), 'economy');
    assert.equal(normalizeColiseumCategoryKey(''), null);
    assert.equal(normalizeColiseumCategoryKey(undefined), null);
    assert.equal(normalizeColiseumCategoryKey('not-a-cat'), null);
});

test('normalizeColiseumCategoryKeys deduplicates and discards unknowns', () => {
    const keys = normalizeColiseumCategoryKeys(['politics', 'political', 'tech', 'ai', 'bogus']);
    assert.deepEqual(keys, ['politics', 'tech']);
});

test('COLISEUM_TOPIC_CATEGORY_KEYS includes core categories', () => {
    assert.ok(COLISEUM_TOPIC_CATEGORY_KEYS.includes('politics'));
    assert.ok(COLISEUM_TOPIC_CATEGORY_KEYS.includes('tech'));
    assert.ok(COLISEUM_TOPIC_CATEGORY_KEYS.includes('other'));
});

test('deriveColiseumTopicStatus handles emerging/active/closing/archived', () => {
    const createdAt = '2026-05-02T11:30:00Z';
    assert.equal(deriveColiseumTopicStatus({ createdAt }, NOW), 'emerging');
    assert.equal(
        deriveColiseumTopicStatus({ createdAt: '2026-05-02T08:00:00Z' }, NOW),
        'active',
    );
    assert.equal(
        deriveColiseumTopicStatus(
            { createdAt: '2026-05-02T08:00:00Z', closesAt: '2026-05-02T11:00:00Z' },
            NOW,
        ),
        'closing',
    );
    assert.equal(
        deriveColiseumTopicStatus(
            { createdAt: '2026-05-01T00:00:00Z', archivesAt: '2026-05-02T00:00:00Z' },
            NOW,
        ),
        'archived',
    );
});

test('isValidCitationKind enumerates supported kinds', () => {
    for (const k of COLISEUM_CITATION_KINDS) {
        assert.equal(isValidCitationKind(k), true);
    }
    assert.equal(isValidCitationKind('foo'), false);
    assert.equal(isValidCitationKind(undefined), false);
});

test('validateCitation accepts well-formed shapes and rejects bad ones', () => {
    assert.deepEqual(
        validateCitation({ kind: 'live', roomId: '!abc:example.org' }),
        { kind: 'live', roomId: '!abc:example.org', eventId: undefined },
    );
    assert.deepEqual(
        validateCitation({ kind: 'townhall', meetingId: 'm-123' }),
        { kind: 'townhall', meetingId: 'm-123' },
    );
    assert.deepEqual(
        validateCitation({ kind: 'audio', mxc: 'mxc://example.org/abc-1' }),
        { kind: 'audio', mxc: 'mxc://example.org/abc-1', durationMs: undefined },
    );
    assert.deepEqual(
        validateCitation({
            kind: 'article',
            sourceUrl: 'https://news.example/post',
            title: 'Headline',
        }),
        {
            kind: 'article',
            sourceUrl: 'https://news.example/post',
            title: 'Headline',
            publishedAt: undefined,
        },
    );

    assert.equal(validateCitation({ kind: 'live', roomId: 'not-a-room' }), null);
    assert.equal(validateCitation({ kind: 'audio', mxc: 'http://nope' }), null);
    assert.equal(validateCitation({ kind: 'article', sourceUrl: 'ftp://x', title: 't' }), null);
    assert.equal(validateCitation({ kind: 'unknown' }), null);
    assert.equal(validateCitation(null), null);
});

test('validateCitations preserves order and drops invalid entries', () => {
    const out = validateCitations([
        { kind: 'live', roomId: '!a:server' },
        { kind: 'unknown' },
        { kind: 'townhall', meetingId: 'm' },
    ]);
    assert.equal(out.length, 2);
    assert.equal(out[0]?.kind, 'live');
    assert.equal(out[1]?.kind, 'townhall');
});

test('citationDepthScore rewards breadth over volume', () => {
    const single = citationDepthScore([{ kind: 'live', roomId: '!a:b' }]);
    const broad = citationDepthScore([
        { kind: 'live', roomId: '!a:b' },
        { kind: 'townhall', meetingId: 'm' },
        { kind: 'audio', mxc: 'mxc://e/x' },
    ]);
    assert.ok(broad > single);
    assert.ok(citationDepthScore([]) === 0);
    assert.ok(broad <= 1);
});

test('wilsonLowerBound is conservative for small samples', () => {
    const small = wilsonLowerBound(5, 0);
    const large = wilsonLowerBound(200, 10);
    assert.ok(small < large);
    assert.equal(wilsonLowerBound(0, 0), 0);
});

test('scoreColiseumArgument respects ranking model and weights', () => {
    const arg: ColiseumArgument = {
        id: 'a1',
        topicId: 't1',
        authorId: '@u:s',
        stance: 'for',
        stanceWeight: 0.8,
        body: 'argument body',
        citations: [{ kind: 'live', roomId: '!r:s' }],
        createdAt: '2026-05-02T11:00:00Z',
        voteScore: 0.7,
        nuanceScore: 0.4,
    };
    const polis = scoreColiseumArgument(arg, { model: 'coliseum_polis_v1', nowMs: NOW });
    const recencyOnly = scoreColiseumArgument(arg, { model: 'recency_only', nowMs: NOW });
    const votesOnly = scoreColiseumArgument(arg, { model: 'votes_only', nowMs: NOW });

    assert.ok(polis > 0 && polis <= 1);
    assert.ok(recencyOnly > 0 && recencyOnly <= 1);
    assert.equal(votesOnly, 0.7);
});

test('rankColiseumArguments sorts highest score first and is monotonic in voteScore', () => {
    const base = {
        topicId: 't1',
        authorId: '@u:s',
        stance: 'for' as const,
        stanceWeight: 0.5,
        body: '',
        citations: [],
        createdAt: '2026-05-02T11:00:00Z',
        nuanceScore: 0,
    };
    const ranked = rankColiseumArguments(
        [
            { ...base, id: 'low', voteScore: 0.1 },
            { ...base, id: 'high', voteScore: 0.9 },
        ],
        { nowMs: NOW },
    );
    assert.equal(ranked[0]?.id, 'high');
    assert.equal(ranked[1]?.id, 'low');
});

test('rankColiseumArguments awards stance-balance bonus to nuance', () => {
    const base = {
        topicId: 't1',
        authorId: '@u:s',
        stanceWeight: 1,
        body: '',
        citations: [],
        createdAt: '2026-05-02T11:00:00Z',
        voteScore: 0.5,
        nuanceScore: 0,
    };
    const ranked = rankColiseumArguments(
        [
            { ...base, id: 'for', stance: 'for' as const },
            { ...base, id: 'nuance', stance: 'nuance' as const, stanceWeight: 0 },
        ],
        { nowMs: NOW },
    );
    assert.equal(ranked[0]?.id, 'nuance');
});

test('DEFAULT_COLISEUM_WEIGHTS contributing weights sum to 1', () => {
    const total =
        DEFAULT_COLISEUM_WEIGHTS.votes +
        DEFAULT_COLISEUM_WEIGHTS.recency +
        DEFAULT_COLISEUM_WEIGHTS.citationDepth +
        DEFAULT_COLISEUM_WEIGHTS.stanceBalance +
        DEFAULT_COLISEUM_WEIGHTS.consensus;
    assert.ok(Math.abs(total - 1) < 1e-9);
});

test('computeTopicHeat blends recency and velocity', () => {
    const fresh = computeTopicHeat({
        publishedAt: '2026-05-02T11:30:00Z',
        createdAt: '2026-05-02T11:30:00Z',
        argumentCount: 10,
        voteCount: 80,
        nowMs: NOW,
    });
    const stale = computeTopicHeat({
        publishedAt: '2026-04-01T00:00:00Z',
        createdAt: '2026-04-01T00:00:00Z',
        argumentCount: 10,
        voteCount: 80,
        nowMs: NOW,
    });
    assert.ok(fresh.debateHeat > stale.debateHeat);
    assert.ok(fresh.recencyScore <= 1 && fresh.recencyScore >= 0);
    assert.ok(fresh.velocityScore <= 1 && fresh.velocityScore >= 0);
});

test('normalizeColiseumTopic fills status, debate heat, and category', () => {
    const topic = normalizeColiseumTopic(
        {
            id: 't1',
            title: 'Headline debate',
            newsAnchor: {
                sourceUrl: 'https://news.example/x',
                headline: 'A thing happened',
                publishedAt: '2026-05-02T11:30:00Z',
            },
            createdAt: '2026-05-02T11:30:00Z',
            tags: ['breaking'],
            category: 'finance',
            argumentCount: 4,
            voteCount: 20,
        },
        NOW,
    );
    assert.equal(topic.category, 'economy');
    assert.equal(topic.status, 'emerging');
    assert.ok(topic.debateHeat >= 0 && topic.debateHeat <= 1);
});

test('rankColiseumTopics sorts by debateHeat desc', () => {
    const hot = normalizeColiseumTopic(
        {
            id: 'hot',
            title: 'Hot',
            newsAnchor: { sourceUrl: 'https://e/h', headline: 'h', publishedAt: '2026-05-02T11:50:00Z' },
            createdAt: '2026-05-02T11:50:00Z',
            tags: [],
            argumentCount: 30,
            voteCount: 200,
        },
        NOW,
    );
    const cold = normalizeColiseumTopic(
        {
            id: 'cold',
            title: 'Cold',
            newsAnchor: { sourceUrl: 'https://e/c', headline: 'c', publishedAt: '2026-04-01T00:00:00Z' },
            createdAt: '2026-04-01T00:00:00Z',
            tags: [],
            argumentCount: 0,
            voteCount: 0,
        },
        NOW,
    );
    const ranked = rankColiseumTopics([cold, hot]);
    assert.equal(ranked[0]?.id, 'hot');
});

test('isValidColiseumTab + resolveEnabledColiseumTabs respect config', () => {
    for (const tab of COLISEUM_TABS) assert.ok(isValidColiseumTab(tab));
    assert.equal(isValidColiseumTab('not-a-tab'), false);
    assert.equal(DEFAULT_COLISEUM_TAB, 'topics');

    assert.deepEqual(resolveEnabledColiseumTabs(undefined), []);
    assert.deepEqual(resolveEnabledColiseumTabs({ enabled: false }), []);
    assert.deepEqual(resolveEnabledColiseumTabs({ enabled: true }), [...COLISEUM_TABS]);
    assert.deepEqual(
        resolveEnabledColiseumTabs({ enabled: true, enabledTabs: ['topics', 'live'] }),
        ['topics', 'live'],
    );
    assert.deepEqual(
        resolveEnabledColiseumTabs({ enabled: true, enabledTabs: ['topics', 'bogus' as never] }),
        ['topics'],
    );
});

test('COLISEUM_STANCES includes for/against/nuance', () => {
    assert.deepEqual([...COLISEUM_STANCES].sort(), ['against', 'for', 'nuance']);
});

test('buildVoteMatrix builds a deterministic voter × argument matrix', () => {
    const args: ColiseumArgument[] = [
        argFixture('a1'),
        argFixture('a2'),
    ];
    const votes: ColiseumVote[] = [
        { argumentId: 'a1', voterId: '@u1:s', direction: 'up', createdAt: '2026-05-02T11:00:00Z' },
        { argumentId: 'a2', voterId: '@u1:s', direction: 'down', createdAt: '2026-05-02T11:00:00Z' },
        { argumentId: 'a1', voterId: '@u2:s', direction: 'down', createdAt: '2026-05-02T11:00:00Z' },
    ];
    const matrix = buildVoteMatrix(args, votes);
    assert.deepEqual(matrix.voterIds, ['@u1:s', '@u2:s']);
    assert.deepEqual(matrix.argumentIds, ['a1', 'a2']);
    assert.equal(matrix.rows[0]?.[0], 1);
    assert.equal(matrix.rows[0]?.[1], -1);
    assert.equal(matrix.rows[1]?.[0], -1);
    assert.equal(matrix.rows[1]?.[1], 0);
});

test('kmeansCluster is deterministic with a fixed seed', () => {
    const args = [argFixture('a1'), argFixture('a2'), argFixture('a3')];
    // Two factions: voters 1-3 love a1/a2 and hate a3; voters 4-6 the inverse.
    const votes: ColiseumVote[] = [
        ...mkVotes(['@u1:s', '@u2:s', '@u3:s'], 'a1', 'up'),
        ...mkVotes(['@u1:s', '@u2:s', '@u3:s'], 'a2', 'up'),
        ...mkVotes(['@u1:s', '@u2:s', '@u3:s'], 'a3', 'down'),
        ...mkVotes(['@u4:s', '@u5:s', '@u6:s'], 'a1', 'down'),
        ...mkVotes(['@u4:s', '@u5:s', '@u6:s'], 'a2', 'down'),
        ...mkVotes(['@u4:s', '@u5:s', '@u6:s'], 'a3', 'up'),
    ];
    const matrix = buildVoteMatrix(args, votes);
    const a = kmeansCluster(matrix, { k: 2, seed: 42 });
    const b = kmeansCluster(matrix, { k: 2, seed: 42 });
    assert.deepEqual(a.assignments, b.assignments);

    // Voters 1-3 should be in one cluster and voters 4-6 in another.
    const idToCluster = new Map(matrix.voterIds.map((id, i) => [id, a.assignments[i]!]));
    const clusterA = idToCluster.get('@u1:s');
    const clusterB = idToCluster.get('@u4:s');
    assert.notEqual(clusterA, clusterB);
    assert.equal(idToCluster.get('@u2:s'), clusterA);
    assert.equal(idToCluster.get('@u3:s'), clusterA);
    assert.equal(idToCluster.get('@u5:s'), clusterB);
    assert.equal(idToCluster.get('@u6:s'), clusterB);
});

test('computeConsensus surfaces cross-cluster agreement', () => {
    const args = [argFixture('partisan'), argFixture('consensus')];
    // Two factions, but BOTH agree the "consensus" argument is good.
    const votes: ColiseumVote[] = [
        ...mkVotes(['@u1:s', '@u2:s', '@u3:s'], 'partisan', 'up'),
        ...mkVotes(['@u4:s', '@u5:s', '@u6:s'], 'partisan', 'down'),
        ...mkVotes(['@u1:s', '@u2:s', '@u3:s', '@u4:s', '@u5:s', '@u6:s'], 'consensus', 'up'),
    ];
    const matrix = buildVoteMatrix(args, votes);
    const cluster = kmeansCluster(matrix, { k: 2, seed: 1 });
    const report = computeConsensus(matrix, cluster);

    const partisanScore = report.consensusByArgument.get('partisan') ?? 0;
    const consensusScore = report.consensusByArgument.get('consensus') ?? 0;
    assert.ok(consensusScore > partisanScore);
    assert.ok(consensusScore >= 0.9);
    // Partisan argument has near-zero min-cluster agreement (one cluster downvotes it).
    assert.ok(partisanScore <= 0.1);
});

test('deriveColiseumWinnerVerdict picks consensus argument over a partisan one', () => {
    const partisan: ColiseumArgument = {
        ...argFixture('partisan'),
        stance: 'for',
        stanceWeight: 1,
        voteScore: 0.5,
    };
    const consensus: ColiseumArgument = {
        ...argFixture('consensus'),
        stance: 'nuance',
        stanceWeight: 0,
        voteScore: 0.5,
    };
    const votes: ColiseumVote[] = [
        ...mkVotes(['@u1:s', '@u2:s', '@u3:s'], 'partisan', 'up'),
        ...mkVotes(['@u4:s', '@u5:s', '@u6:s'], 'partisan', 'down'),
        ...mkVotes(['@u1:s', '@u2:s', '@u3:s', '@u4:s', '@u5:s', '@u6:s'], 'consensus', 'up'),
    ];

    const verdict = deriveColiseumWinnerVerdict({
        topicId: 't1',
        arguments: [partisan, consensus],
        votes,
        seed: 1,
        nowMs: NOW,
    });
    assert.equal(verdict.winningArgumentId, 'consensus');
    assert.ok(verdict.consensusArgumentIds.includes('consensus'));
    assert.equal(verdict.model, 'coliseum_polis_v1');
});

test('deriveColiseumWinnerVerdict handles empty inputs', () => {
    const verdict = deriveColiseumWinnerVerdict({
        topicId: 't',
        arguments: [],
        votes: [],
        nowMs: NOW,
    });
    assert.equal(verdict.winningArgumentId, null);
    assert.deepEqual(verdict.runnersUp, []);
    assert.deepEqual(verdict.consensusArgumentIds, []);
});

function argFixture(id: string): ColiseumArgument {
    return {
        id,
        topicId: 't1',
        authorId: '@u:s',
        stance: 'for',
        stanceWeight: 0.5,
        body: id,
        citations: [],
        createdAt: '2026-05-02T11:00:00Z',
        voteScore: 0,
        nuanceScore: 0,
    };
}

function mkVotes(
    voterIds: readonly string[],
    argumentId: string,
    direction: 'up' | 'down',
): ColiseumVote[] {
    return voterIds.map((voterId) => ({
        voterId,
        argumentId,
        direction,
        createdAt: '2026-05-02T11:00:00Z',
    }));
}
