import test from 'node:test';
import assert from 'node:assert/strict';
import {
    PLUGIN_DOMAINS,
    PLUGIN_DOMAIN_SURFACE,
    isPluginDomain,
    parseNormalizedListing,
    parseCreatorListingDraft,
} from '@blackout/core';

test('PLUGIN_DOMAINS covers the seven ecosystem domains', () => {
    assert.deepEqual(
        [...PLUGIN_DOMAINS].sort(),
        [
            'ai',
            'coalition',
            'coliseum',
            'community-infrastructure',
            'creator-hub',
            'marketplace',
            'profile',
        ].sort(),
    );
});

test('every domain maps to a discovery surface', () => {
    for (const domain of PLUGIN_DOMAINS) {
        assert.equal(typeof PLUGIN_DOMAIN_SURFACE[domain], 'string');
        assert.ok(PLUGIN_DOMAIN_SURFACE[domain].length > 0);
    }
});

test('isPluginDomain accepts known domains and rejects others', () => {
    assert.equal(isPluginDomain('ai'), true);
    assert.equal(isPluginDomain('coalition'), true);
    assert.equal(isPluginDomain('not-a-domain'), false);
    assert.equal(isPluginDomain(42), false);
    assert.equal(isPluginDomain(undefined), false);
});

test('parseNormalizedListing keeps domain when valid and drops it when invalid', () => {
    const base = {
        providerId: 'freeblackmarket',
        providerListingId: 'L1',
        category: 'plugin-curated',
        title: 'Debate Timer',
        description: 'Timed debate module',
        priceCents: 0,
        currency: 'USD',
        mediaUrls: [],
        entitlementKind: 'plugin_flag',
    };
    assert.equal(parseNormalizedListing({ ...base, domain: 'coliseum' }).domain, 'coliseum');
    assert.equal(parseNormalizedListing({ ...base, domain: 'bogus' }).domain, undefined);
    assert.equal(parseNormalizedListing(base).domain, undefined);
});

test('parseCreatorListingDraft accepts an optional domain', () => {
    const draft = {
        artifactKind: 'manifest_plugin',
        category: 'plugin-curated',
        domain: 'creator-hub',
        entitlementKind: 'plugin_flag',
        title: 'Stream Overlay',
        description: 'Donation overlay widget',
        priceCents: 500,
        currency: 'USD',
        artifactPayload: {},
    };
    assert.equal(parseCreatorListingDraft(draft).domain, 'creator-hub');
    assert.equal(parseCreatorListingDraft({ ...draft, domain: undefined }).domain, undefined);
});
