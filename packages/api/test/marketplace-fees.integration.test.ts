import test from 'node:test';
import assert from 'node:assert/strict';
import {
    computePlatformCommission,
    feeForProvider,
    marketplaceProviderFees,
} from '@blackout/core';

test('FreeBlackMarket charges a flat 3% commission', () => {
    const fbm = feeForProvider('freeblackmarket');
    assert.equal(fbm.feeBps, 300);
    assert.equal(fbm.displayFeePercent, 3);
    assert.equal(fbm.processingHandledByProvider, true);
});

test('Other marketplace providers retain their existing fee schedules', () => {
    assert.equal(marketplaceProviderFees.blamazon.feeBps, 1_500);
    assert.equal(marketplaceProviderFees['mayhem-marketplaze'].feeBps, 1_200);
    assert.equal(marketplaceProviderFees['antin-amazon'].feeBps, 2_000);
});

test('computePlatformCommission splits a $5.00 tip 3%/97% by default (FBM)', () => {
    const split = computePlatformCommission(500);
    assert.equal(split.providerId, 'freeblackmarket');
    assert.equal(split.feeBps, 300);
    assert.equal(split.grossCents, 500);
    assert.equal(split.feeCents, 15);
    assert.equal(split.netCents, 485);
});

test('computePlatformCommission rounds half-cents to the nearest integer', () => {
    // 333 * 0.03 = 9.99 -> 10 ; net = 323
    const split = computePlatformCommission(333);
    assert.equal(split.feeCents, 10);
    assert.equal(split.netCents, 323);
});

test('computePlatformCommission honors per-provider rates when specified', () => {
    const split = computePlatformCommission(10_000, 'antin-amazon');
    assert.equal(split.feeBps, 2_000);
    assert.equal(split.feeCents, 2_000);
    assert.equal(split.netCents, 8_000);
});

test('computePlatformCommission handles zero gross without rounding artifacts', () => {
    const split = computePlatformCommission(0);
    assert.equal(split.feeCents, 0);
    assert.equal(split.netCents, 0);
});

test('computePlatformCommission rejects negative or non-integer gross amounts', () => {
    assert.throws(() => computePlatformCommission(-1), RangeError);
    assert.throws(() => computePlatformCommission(1.5), RangeError);
    assert.throws(() => computePlatformCommission(Number.NaN), RangeError);
});
