import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateRatings, isValidRating } from '@blackout/core';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');

const USER_A = 'ps-a';
const USER_B = 'ps-b';

function headers(userId: string): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(userId, userId, 600)}`,
        'content-type': 'application/json',
    };
}

test('aggregateRatings ignores invalid ratings and rounds the mean', () => {
    assert.deepEqual(aggregateRatings([]), { count: 0, average: 0 });
    assert.deepEqual(aggregateRatings([5, 4, 4]), { count: 3, average: 4.33 });
    assert.deepEqual(aggregateRatings([5, 0, 9, 3]), { count: 2, average: 4 });
    assert.equal(isValidRating(3), true);
    assert.equal(isValidRating(6), false);
});

test('social routes 404 when the flag is off', async () => {
    const res = await app.request('/v1/plugin-social/reviews/some-plugin', {
        headers: headers(USER_A),
    });
    assert.equal(res.status, 404);
});

test('reviews are one-per-user and aggregate to a rating', async () => {
    process.env.BLACKOUT_PLUGIN_SOCIAL = 'true';
    try {
        const post = (userId: string, rating: number) =>
            app.request('/v1/plugin-social/reviews/cool-plugin', {
                method: 'POST',
                headers: headers(userId),
                body: JSON.stringify({ rating, body: 'nice' }),
            });

        assert.equal((await post(USER_A, 5)).status, 201);
        assert.equal((await post(USER_B, 3)).status, 201);
        // Re-review by A updates rather than adds.
        assert.equal((await post(USER_A, 4)).status, 201);

        const bad = await post(USER_A, 9);
        assert.equal(bad.status, 400);
        assert.equal(((await bad.json()) as { code: string }).code, 'invalid_rating');

        const list = await app.request('/v1/plugin-social/reviews/cool-plugin', {
            headers: headers(USER_A),
        });
        const json = (await list.json()) as {
            reviews: unknown[];
            rating: { count: number; average: number };
        };
        assert.equal(json.reviews.length, 2);
        assert.equal(json.rating.count, 2);
        assert.equal(json.rating.average, 3.5); // (4 + 3) / 2
    } finally {
        process.env.BLACKOUT_PLUGIN_SOCIAL = '';
    }
});

test('forks and showcases record and list', async () => {
    process.env.BLACKOUT_PLUGIN_SOCIAL = 'true';
    try {
        const fork = await app.request('/v1/plugin-social/forks/origin-plugin', {
            method: 'POST',
            headers: headers(USER_A),
            body: JSON.stringify({ newPluginId: 'my-fork', note: 'tweaked' }),
        });
        assert.equal(fork.status, 201);
        const forks = await app.request('/v1/plugin-social/forks/origin-plugin', {
            headers: headers(USER_A),
        });
        assert.equal(((await forks.json()) as { forks: unknown[] }).forks.length, 1);

        const showcase = await app.request('/v1/plugin-social/showcases', {
            method: 'POST',
            headers: headers(USER_A),
            body: JSON.stringify({
                pluginId: 'my-fork',
                scopeType: 'den',
                scopeId: 'den-1',
                title: 'Look at this',
            }),
        });
        assert.equal(showcase.status, 201);
        const list = await app.request(
            '/v1/plugin-social/showcases?scopeType=den&scopeId=den-1',
            { headers: headers(USER_A) },
        );
        assert.equal(((await list.json()) as { showcases: unknown[] }).showcases.length, 1);
    } finally {
        process.env.BLACKOUT_PLUGIN_SOCIAL = '';
    }
});
