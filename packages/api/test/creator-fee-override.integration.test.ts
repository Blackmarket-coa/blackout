import test from 'node:test';
import assert from 'node:assert/strict';
import {
    computePlatformCommission,
    isValidFeeBps,
    parseCreatorListingDraft,
    resolveListingFeeBps,
} from '@blackout/core';

const { commissionForListing } = await import('../src/services/creatorFees');

test('isValidFeeBps enforces an integer 0..10000', () => {
    assert.equal(isValidFeeBps(0), true);
    assert.equal(isValidFeeBps(10_000), true);
    assert.equal(isValidFeeBps(500), true);
    assert.equal(isValidFeeBps(-1), false);
    assert.equal(isValidFeeBps(10_001), false);
    assert.equal(isValidFeeBps(12.5), false);
});

test('computePlatformCommission honors a valid fee override', () => {
    const split = computePlatformCommission(1_000, 'freeblackmarket', 500);
    assert.equal(split.feeBps, 500);
    assert.equal(split.feeCents, 50);
    assert.equal(split.netCents, 950);
});

test('computePlatformCommission rejects an invalid override', () => {
    assert.throws(() => computePlatformCommission(1_000, 'freeblackmarket', 10_001), RangeError);
});

test('resolveListingFeeBps only applies the override when allowed', () => {
    // freeblackmarket base is 300 bps.
    assert.equal(resolveListingFeeBps('freeblackmarket', 500, false), 300);
    assert.equal(resolveListingFeeBps('freeblackmarket', 500, true), 500);
    assert.equal(resolveListingFeeBps('freeblackmarket', undefined, true), 300);
    assert.equal(resolveListingFeeBps('freeblackmarket', 10_001, true), 300); // invalid → base
});

test('commissionForListing gates the override behind the flag', () => {
    // Default-on: unset env honors the per-listing override.
    delete process.env.BLACKOUT_CREATOR_FEE_OVERRIDE;
    const on = commissionForListing(1_000, 'freeblackmarket', 500);
    assert.equal(on.feeBps, 500, 'default on → per-listing override');

    // Explicit opt-out falls back to the provider base rate.
    process.env.BLACKOUT_CREATOR_FEE_OVERRIDE = 'false';
    try {
        const off = commissionForListing(1_000, 'freeblackmarket', 500);
        assert.equal(off.feeBps, 300, 'flag off → provider base rate');
    } finally {
        delete process.env.BLACKOUT_CREATOR_FEE_OVERRIDE;
    }
});

test('parseCreatorListingDraft accepts a valid fee override and rejects a bad one', () => {
    const base = {
        artifactKind: 'theme',
        category: 'emoji-sticker',
        entitlementKind: 'emoji_pack',
        title: 'Noir',
        description: 'Dark theme',
        priceCents: 500,
        currency: 'usd',
        artifactPayload: '{}',
    };
    const ok = parseCreatorListingDraft({ ...base, feeBpsOverride: 750 });
    assert.equal(ok.feeBpsOverride, 750);

    const none = parseCreatorListingDraft(base);
    assert.equal(none.feeBpsOverride, undefined);

    assert.throws(() => parseCreatorListingDraft({ ...base, feeBpsOverride: 99_999 }), /feeBpsOverride/);
});
