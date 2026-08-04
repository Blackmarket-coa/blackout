import test from 'node:test';
import assert from 'node:assert/strict';

import {
    computeTopicHeat,
    newsAnchorToSeed,
    normalizeColiseumTopic,
    resolveTopicSeed,
    seedPublishedAt,
    seedToNewsAnchor,
    type ColiseumTopicSeed,
} from '@blackout/core';

const NOW = Date.parse('2026-05-02T12:00:00Z');
const CREATED_AT = '2026-05-02T11:00:00Z';

const LINK_SEED: ColiseumTopicSeed = {
    kind: 'link',
    sourceUrl: 'https://news.example/story',
    headline: 'Something happened',
    publishedAt: '2026-05-02T10:00:00Z',
};

const baseTopic = (seed: ColiseumTopicSeed) => ({
    id: 'topic-1',
    title: 'Should we?',
    seed,
    createdAt: CREATED_AT,
    tags: [] as string[],
});

test('seedPublishedAt uses the article date for a link, creation time otherwise', () => {
    assert.equal(seedPublishedAt(LINK_SEED, CREATED_AT), '2026-05-02T10:00:00Z');
    assert.equal(seedPublishedAt({ kind: 'text' }, CREATED_AT), CREATED_AT);
    assert.equal(
        seedPublishedAt({ kind: 'media', media: { kind: 'video', mxc: 'mxc://s/a' } }, CREATED_AT),
        CREATED_AT
    );
    assert.equal(seedPublishedAt({ kind: 'challenge', open: true }, CREATED_AT), CREATED_AT);
});

/**
 * Regression guard. Recency is 55% of a topic's heat, and `recencyScore`
 * returns a flat 0 for an unparseable date rather than throwing — so a
 * non-link seed that fell back to an absent `newsAnchor.publishedAt` would
 * silently sink to the bottom of the ranked feed with no error anywhere.
 */
test('every seed kind earns real recency, not a silent zero', () => {
    const kinds: ColiseumTopicSeed[] = [
        { kind: 'text' },
        LINK_SEED,
        { kind: 'media', media: { kind: 'video', mxc: 'mxc://s/a' } },
        { kind: 'challenge', opponentId: '@rival:server' },
    ];
    for (const seed of kinds) {
        const topic = normalizeColiseumTopic(baseTopic(seed), NOW);
        assert.ok(topic.recencyScore > 0, `${seed.kind} seed scored ${topic.recencyScore} recency`);
        assert.ok(topic.debateHeat > 0, `${seed.kind} seed scored ${topic.debateHeat} heat`);
    }
});

test('an absent publish date would have zeroed recency — proving the fallback matters', () => {
    const withoutDate = computeTopicHeat({
        publishedAt: '',
        createdAt: CREATED_AT,
        argumentCount: 0,
        voteCount: 0,
        nowMs: NOW,
    });
    assert.equal(withoutDate.recencyScore, 0);

    const withFallback = computeTopicHeat({
        publishedAt: seedPublishedAt({ kind: 'text' }, CREATED_AT),
        createdAt: CREATED_AT,
        argumentCount: 0,
        voteCount: 0,
        nowMs: NOW,
    });
    assert.ok(withFallback.recencyScore > 0);
});

test('a link seed round-trips through the legacy newsAnchor shape', () => {
    const anchor = seedToNewsAnchor(LINK_SEED);
    assert.deepEqual(anchor, {
        sourceUrl: 'https://news.example/story',
        headline: 'Something happened',
        publishedAt: '2026-05-02T10:00:00Z',
    });
    assert.deepEqual(newsAnchorToSeed(anchor!), LINK_SEED);
});

test('non-link seeds have no newsAnchor to project', () => {
    assert.equal(seedToNewsAnchor({ kind: 'text' }), undefined);
    assert.equal(seedToNewsAnchor({ kind: 'challenge', open: true }), undefined);
    assert.equal(
        seedToNewsAnchor({ kind: 'media', media: { kind: 'image', mxc: 'mxc://s/b' } }),
        undefined
    );
});

test('resolveTopicSeed prefers an explicit seed, falls back to a legacy anchor', () => {
    assert.deepEqual(resolveTopicSeed({ seed: { kind: 'text' } }), { kind: 'text' });
    assert.deepEqual(
        resolveTopicSeed({
            newsAnchor: {
                sourceUrl: 'https://news.example/story',
                headline: 'Something happened',
                publishedAt: '2026-05-02T10:00:00Z',
            },
        }),
        LINK_SEED
    );
    // A topic with a title but neither is still debatable — degrade, don't throw.
    assert.deepEqual(resolveTopicSeed({}), { kind: 'text' });
});

test('a pre-seed client posting only newsAnchor still produces a link-seeded topic', () => {
    const topic = normalizeColiseumTopic(
        {
            id: 'topic-legacy',
            title: 'Legacy',
            newsAnchor: {
                sourceUrl: 'https://news.example/story',
                headline: 'Something happened',
                publishedAt: '2026-05-02T10:00:00Z',
            },
            createdAt: CREATED_AT,
            tags: [],
        },
        NOW
    );
    assert.equal(topic.seed.kind, 'link');
    // And the legacy field is still projected back out for old readers.
    assert.equal(topic.newsAnchor?.headline, 'Something happened');
});

test('a text-seeded topic exposes no newsAnchor at all', () => {
    const topic = normalizeColiseumTopic(baseTopic({ kind: 'text' }), NOW);
    assert.equal(topic.seed.kind, 'text');
    assert.equal(topic.newsAnchor, undefined);
});
