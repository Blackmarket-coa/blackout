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
const { discoveryService } = await import('../src/services/discovery');

function authHeader(sub = 'search-test-user'): Record<string, string> {
    return {
        authorization: `Bearer ${signJwt(sub, 'search', 600)}`,
        'content-type': 'application/json',
    };
}

test('global search spans coalitions, creators, bounties, and projects', async () => {
    // Seed a discoverable creator + coalition via the discovery index.
    discoveryService.upsertProfile({
        id: '@compostking:bmc',
        entityType: 'creator',
        name: 'Compost King',
        bio: 'All about compost',
        visibility: 'public',
        moderationStatus: 'approved',
    });
    discoveryService.upsertProfile({
        id: '!compost-canopy:bmc',
        entityType: 'canopy',
        name: 'Compost Coalition',
        visibility: 'public',
        moderationStatus: 'approved',
    });
    // Profiles stage into sourceProfiles; browse reads the built index.
    discoveryService.runFullIndex();

    // Seed a bounty + a project that mention "compost".
    await app.request('/v1/bounties', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({
            category: 'creator',
            title: 'Compost explainer video',
            description: 'Make a short video about compost',
            rewardType: 'cash',
            rewardSummary: '$50',
        }),
    });
    await app.request('/v1/coalition/projects', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({
            canopyId: '!compost-canopy:bmc',
            title: 'Compost hub build',
            category: 'community_garden',
        }),
    });

    const res = await app.request('/v1/search?q=compost');
    assert.equal(res.status, 200);
    const { results } = (await res.json()) as {
        results: Array<{ type: string; title: string }>;
    };
    const types = new Set(results.map((r) => r.type));
    assert.ok(types.has('creator'), 'expected a creator hit');
    assert.ok(types.has('coalition'), 'expected a coalition hit');
    assert.ok(types.has('bounty'), 'expected a bounty hit');
    assert.ok(types.has('project'), 'expected a project hit');
});

test('global search honors the types= filter', async () => {
    const res = await app.request('/v1/search?q=compost&types=bounty');
    assert.equal(res.status, 200);
    const { results } = (await res.json()) as { results: Array<{ type: string }> };
    assert.ok(results.length > 0);
    assert.ok(results.every((r) => r.type === 'bounty'));
});

test('global trending returns a ranked cross-entity list', async () => {
    const res = await app.request('/v1/search/trending');
    assert.equal(res.status, 200);
    const { results } = (await res.json()) as { results: Array<{ score: number }> };
    assert.ok(Array.isArray(results));
    for (let i = 1; i < results.length; i++) {
        assert.ok(results[i - 1]!.score >= results[i]!.score, 'results must be score-descending');
    }
});
