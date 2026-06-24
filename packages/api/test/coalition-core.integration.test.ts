import test from 'node:test';
import assert from 'node:assert/strict';

import {
    AID_POST_CATEGORIES,
    COALITION_TABS,
    DEFAULT_RANKING_WEIGHTS,
    SPATIAL_LAYER_KEYS,
    deriveDisplayStatus,
    deriveSpatialEventStatus,
    haversineDistanceMeters,
    isWithinDisplayRadius,
    normalizeSpatialFeedItem,
    normalizeSpatialLayerKey,
    normalizeSpatialLayerKeys,
    rankCoalitionFeed,
    resolveEnabledTabs,
    scoreCoalitionItem,
    severityToScore,
    spatialHeatWeight,
    type AidPost,
    type CoalitionFeedItem,
} from '@blackout/core';

const NOW = Date.parse('2026-05-02T12:00:00Z');

test('normalizeSpatialLayerKey resolves aliases', () => {
    assert.equal(normalizeSpatialLayerKey('marketplace'), 'vendors');
    assert.equal(normalizeSpatialLayerKey('GOVERNANCE'), 'votes');
    assert.equal(normalizeSpatialLayerKey('mutual aid'), 'aid');
    assert.equal(normalizeSpatialLayerKey('  jobs '), 'jobs');
    assert.equal(normalizeSpatialLayerKey(''), null);
    assert.equal(normalizeSpatialLayerKey(undefined), null);
    assert.equal(normalizeSpatialLayerKey('not-a-layer'), null);
});

test('normalizeSpatialLayerKeys deduplicates and discards unknowns', () => {
    const keys = normalizeSpatialLayerKeys(['vendors', 'marketplace', 'aid', 'mutual aid', 'bogus']);
    assert.deepEqual(keys, ['vendors', 'aid']);
});

test('normalizeSpatialLayerKey resolves the new living-map aliases', () => {
    assert.equal(normalizeSpatialLayerKey('event'), 'events');
    assert.equal(normalizeSpatialLayerKey('livestreams'), 'streams');
    assert.equal(normalizeSpatialLayerKey('canopies'), 'communities');
    assert.equal(normalizeSpatialLayerKey('markets'), 'vendors');
});

test('spatialHeatWeight takes the strongest of severity, activity, and liveness', () => {
    // A live event with no other signal still radiates the live floor (0.8).
    assert.equal(
        spatialHeatWeight({ startsAt: '2026-05-02T11:00:00Z', endsAt: '2026-05-02T13:00:00Z' }, NOW),
        0.8,
    );
    // High activity beats the live floor.
    assert.equal(
        spatialHeatWeight(
            { startsAt: '2026-05-02T11:00:00Z', endsAt: '2026-05-02T13:00:00Z', activityLevel: 0.95 },
            NOW,
        ),
        0.95,
    );
    // A past pin with only low severity radiates just that.
    assert.equal(
        spatialHeatWeight(
            { startsAt: '2026-05-01T00:00:00Z', endsAt: '2026-05-01T01:00:00Z', severity: 'low' },
            NOW,
        ),
        severityToScore('low'),
    );
    // Nothing notable → no heat.
    assert.equal(spatialHeatWeight({ startsAt: '2026-05-03T00:00:00Z' }, NOW), 0);
});

test('SPATIAL_LAYER_KEYS covers the canonical layers including the living-map additions', () => {
    assert.equal(SPATIAL_LAYER_KEYS.length, 13);
    for (const key of [
        'video',
        'vendors',
        'aid',
        'votes',
        'infra',
        'events',
        'dens',
        'streams',
        'projects',
        'communities',
        'mycelium',
    ]) {
        assert.ok(SPATIAL_LAYER_KEYS.includes(key), `expected layer ${key}`);
    }
});

test('deriveSpatialEventStatus handles upcoming/live/past', () => {
    const startsAt = '2026-05-02T11:00:00Z';
    const endsAt = '2026-05-02T13:00:00Z';
    assert.equal(
        deriveSpatialEventStatus({ startsAt: '2026-05-03T00:00:00Z' }, NOW),
        'upcoming',
    );
    assert.equal(deriveSpatialEventStatus({ startsAt, endsAt }, NOW), 'live');
    assert.equal(
        deriveSpatialEventStatus({ startsAt: '2026-05-01T00:00:00Z', endsAt: '2026-05-01T01:00:00Z' }, NOW),
        'past',
    );
    assert.equal(deriveSpatialEventStatus({ startsAt: 'not-a-date' }, NOW), 'upcoming');
});

test('normalizeSpatialFeedItem fills status and rejects unknown layers', () => {
    const item = normalizeSpatialFeedItem({
        id: 'a',
        layer: 'marketplace',
        title: 'Stand',
        latitude: 40,
        longitude: -74,
        visibility: 'public',
        eventType: 'farm',
        startsAt: '2026-05-02T11:00:00Z',
        endsAt: '2026-05-02T13:00:00Z',
    });
    assert.ok(item);
    assert.equal(item?.layer, 'vendors');
    assert.ok(['upcoming', 'live', 'past'].includes(item!.status));

    assert.equal(
        normalizeSpatialFeedItem({
            id: 'b',
            layer: 'space',
            title: 't',
            latitude: 0,
            longitude: 0,
            visibility: 'public',
            eventType: 'other',
            startsAt: '2026-05-02T11:00:00Z',
        }),
        null,
    );
});

test('severityToScore maps to 0..1', () => {
    assert.equal(severityToScore(undefined), 0);
    assert.equal(severityToScore('low'), 0.25);
    assert.equal(severityToScore('critical'), 1);
});

test('scoreCoalitionItem applies ranking model', () => {
    const item: Omit<CoalitionFeedItem, 'score'> = {
        id: 'x',
        kind: 'video',
        title: 't',
        createdAt: '2026-05-02T11:00:00Z',
        importance: 0.8,
        impact: 0.6,
        socialImpact: 0.4,
    };
    const social = scoreCoalitionItem(item, { model: 'coalition_social_v1', nowMs: NOW });
    const recency = scoreCoalitionItem(item, { model: 'recency_only', nowMs: NOW });
    const importance = scoreCoalitionItem(item, { model: 'importance_only', nowMs: NOW });

    assert.ok(social > 0 && social <= 1);
    assert.ok(recency > 0 && recency <= 1);
    assert.equal(importance, 0.8);
});

test('rankCoalitionFeed sorts highest score first', () => {
    const ranked = rankCoalitionFeed(
        [
            { id: 'old', kind: 'event', title: '', createdAt: '2026-04-01T00:00:00Z', importance: 0.1, impact: 0.1, socialImpact: 0.1 },
            { id: 'new', kind: 'event', title: '', createdAt: '2026-05-02T11:00:00Z', importance: 0.9, impact: 0.9, socialImpact: 0.9 },
        ],
        { nowMs: NOW },
    );
    assert.equal(ranked[0]?.id, 'new');
});

test('DEFAULT_RANKING_WEIGHTS sum reasonable', () => {
    const total =
        DEFAULT_RANKING_WEIGHTS.importance +
        DEFAULT_RANKING_WEIGHTS.impact +
        DEFAULT_RANKING_WEIGHTS.socialImpact;
    assert.ok(Math.abs(total - 1) < 1e-9);
});

test('AID_POST_CATEGORIES enumerates known kinds', () => {
    assert.ok(AID_POST_CATEGORIES.includes('food'));
    assert.ok(AID_POST_CATEGORIES.includes('childcare'));
});

test('deriveDisplayStatus expires past posts', () => {
    const post: AidPost = {
        id: 'p',
        customerId: 'u',
        type: 'need',
        category: 'food',
        title: 't',
        description: 'd',
        location: { latitude: 0, longitude: 0 },
        displayRadiusMeters: 400,
        urgency: 'medium',
        expiresAt: '2026-05-01T00:00:00Z',
        status: 'open',
    };
    assert.equal(deriveDisplayStatus(post, NOW), 'expired');
    assert.equal(deriveDisplayStatus({ ...post, status: 'fulfilled' }, NOW), 'fulfilled');
    assert.equal(deriveDisplayStatus({ ...post, expiresAt: undefined }, NOW), 'open');
});

test('haversineDistanceMeters and isWithinDisplayRadius', () => {
    const a = { latitude: 40.7128, longitude: -74.006 };
    const b = { latitude: 40.7138, longitude: -74.006 };
    const meters = haversineDistanceMeters(a, b);
    assert.ok(meters > 100 && meters < 130);

    assert.equal(
        isWithinDisplayRadius(
            {
                id: 's',
                sellerId: 's',
                coordinates: a,
                addressLine: '',
                city: '',
                state: '',
                zip: '',
                country: '',
                displayRadiusMeters: 250,
                isVisible: true,
                locationType: 'storefront',
            },
            b,
        ),
        true,
    );
});

test('resolveEnabledTabs respects config', () => {
    assert.deepEqual(resolveEnabledTabs(undefined), []);
    assert.deepEqual(resolveEnabledTabs({ enabled: false }), []);
    assert.deepEqual(resolveEnabledTabs({ enabled: true }), [...COALITION_TABS]);
    assert.deepEqual(
        resolveEnabledTabs({ enabled: true, enabledTabs: ['chat', 'shop'] }),
        ['chat', 'shop'],
    );
    assert.deepEqual(
        resolveEnabledTabs({ enabled: true, enabledTabs: ['chat', 'bogus' as never] }),
        ['chat'],
    );
});
