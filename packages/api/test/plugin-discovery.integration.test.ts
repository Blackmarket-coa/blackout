import test from 'node:test';
import assert from 'node:assert/strict';
import {
    rankPluginRecommendations,
    scorePluginRecommendation,
    surfaceForDomain,
    type PluginRecommendation,
} from '@blackout/core';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET_PRIMARY =
    process.env.JWT_SECRET_PRIMARY ?? 'Str0ng!TestKey-For-Api-Integration-1234#ABCxyzZZ';
process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? 'blackout-api-test';
process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'blackout-client-test';
process.env.BLACKOUT_DB_MODE = process.env.BLACKOUT_DB_MODE ?? 'memory';

const { default: app } = await import('../src/index');
const { signJwt } = await import('../src/services/auth');
const { db } = await import('../src/db/store');
const { discoverPlugins } = await import('../src/services/pluginDiscovery');
const { submitReview } = await import('../src/services/pluginSocial');

function headers(userId: string): Record<string, string> {
    return { authorization: `Bearer ${signJwt(userId, userId, 600)}`, 'content-type': 'application/json' };
}

const rec = (over: Partial<PluginRecommendation>): PluginRecommendation => ({
    pluginId: 'p',
    surface: 'marketplace',
    installCount: 0,
    rating: 0,
    ratingCount: 0,
    ...over,
});

test('surfaceForDomain maps domain to ecosystem surface', () => {
    assert.equal(surfaceForDomain('ai'), 'aiden');
    assert.equal(surfaceForDomain('coliseum'), 'coliseum');
    assert.equal(surfaceForDomain(undefined), 'marketplace');
});

test('scorePluginRecommendation lets rating dominate but rewards adoption', () => {
    const wellRated = rec({ pluginId: 'a', rating: 5, installCount: 1 });
    const popular = rec({ pluginId: 'b', rating: 2, installCount: 1000 });
    assert.ok(scorePluginRecommendation(wellRated) > scorePluginRecommendation(popular));
});

test('rankPluginRecommendations is deterministic with stable tiebreaks', () => {
    const ranked = rankPluginRecommendations([
        rec({ pluginId: 'low', rating: 1, installCount: 1 }),
        rec({ pluginId: 'high', rating: 5, installCount: 1 }),
        rec({ pluginId: 'mid', rating: 3, installCount: 1 }),
    ]);
    assert.deepEqual(ranked.map((r) => r.pluginId), ['high', 'mid', 'low']);
});

test('discoverPlugins joins active installs + ratings and places by domain', () => {
    // Two active installs of an AI plugin, one of a coliseum plugin.
    db.createPluginInstallation({
        id: 'di-1', pluginId: 'ai-helper', entitlementId: null, scopeType: 'den', scopeId: 'd1',
        installedByUserId: 'u1', status: 'enabled', artifactKind: 'code_plugin', domain: 'ai',
        grantedCapabilities: [], config: {}, manifest: {},
    });
    db.createPluginInstallation({
        id: 'di-2', pluginId: 'ai-helper', entitlementId: null, scopeType: 'den', scopeId: 'd2',
        installedByUserId: 'u2', status: 'enabled', artifactKind: 'code_plugin', domain: 'ai',
        grantedCapabilities: [], config: {}, manifest: {},
    });
    db.createPluginInstallation({
        id: 'di-3', pluginId: 'debate-timer', entitlementId: null, scopeType: 'user', scopeId: 'u1',
        installedByUserId: 'u1', status: 'enabled', artifactKind: 'manifest_plugin', domain: 'coliseum',
        grantedCapabilities: [], config: {}, manifest: {},
    });
    // A disabled install should not count toward adoption.
    db.createPluginInstallation({
        id: 'di-4', pluginId: 'ai-helper', entitlementId: null, scopeType: 'den', scopeId: 'd3',
        installedByUserId: 'u3', status: 'disabled', artifactKind: 'code_plugin', domain: 'ai',
        grantedCapabilities: [], config: {}, manifest: {},
    });
    submitReview({ pluginId: 'ai-helper', userId: 'u1', rating: 5 });

    const all = discoverPlugins();
    const ai = all.find((r) => r.pluginId === 'ai-helper');
    assert.ok(ai);
    assert.equal(ai.surface, 'aiden');
    assert.equal(ai.installCount, 2, 'disabled install excluded');
    assert.equal(ai.rating, 5);

    // Surface filter narrows to one ecosystem surface.
    const coliseum = discoverPlugins({ surface: 'coliseum' });
    assert.equal(coliseum.length, 1);
    assert.equal(coliseum[0].pluginId, 'debate-timer');
});

test('discovery route 404s when the flag is off', async () => {
    const res = await app.request('/v1/plugin-discovery', { headers: headers('u1') });
    assert.equal(res.status, 404);
});
