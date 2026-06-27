import test from 'node:test';
import assert from 'node:assert/strict';

import {
    CREATOR_KIT_MANIFEST,
    parseCoalitionKitManifest,
} from '@blackout/core';

test('CREATOR_KIT_MANIFEST provisions the five creator dens', () => {
    const slugs = CREATOR_KIT_MANIFEST.dens.map((d) => d.slug);
    assert.deepEqual(slugs, ['announcements', 'community', 'supporters', 'vip', 'refrain']);
});

test('tier-gated dens carry minTier; refrain is a bounty board; announcements broadcasts', () => {
    const bySlug = Object.fromEntries(CREATOR_KIT_MANIFEST.dens.map((d) => [d.slug, d]));
    assert.equal(bySlug.supporters?.minTier, 'tier_1');
    assert.equal(bySlug.vip?.minTier, 'tier_2');
    assert.equal(bySlug.refrain?.kind, 'bounty_board');
    assert.equal(bySlug.announcements?.kind, 'broadcast');
    assert.equal(bySlug.community?.kind, 'chat');
    assert.equal(bySlug.community?.minTier, undefined);
});

test('parseCoalitionKitManifest preserves kind and minTier and defaults sensibly', () => {
    const manifest = parseCoalitionKitManifest({
        version: 1,
        kitId: 'k',
        name: 'K',
        archetype: 'creator',
        dens: [
            { slug: 'a', name: 'A', denType: 'coalition', kind: 'bounty_board', minTier: 'tier_1' },
            { slug: 'b', name: 'B', denType: 'public' },
            { slug: 'c', name: 'C', denType: 'public', kind: 'nonsense', minTier: '  ' },
        ],
        bundledPluginIds: [],
    });
    const [a, b, c] = manifest.dens;
    assert.equal(a?.kind, 'bounty_board');
    assert.equal(a?.minTier, 'tier_1');
    // No kind/minTier provided → undefined (defaults to chat at render time).
    assert.equal(b?.kind, undefined);
    assert.equal(b?.minTier, undefined);
    // Invalid kind and blank minTier are dropped.
    assert.equal(c?.kind, undefined);
    assert.equal(c?.minTier, undefined);
});
