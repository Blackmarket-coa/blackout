import { describe, expect, it } from 'vitest';
import {
    binarySearch,
    bytesToSize,
    fulfilledPromiseSettledResult,
    millisecondsToMinutes,
    millisecondsToMinutesAndSeconds,
    nameInitials,
    parseGeoUri,
    promiseFulfilledResult,
    promiseRejectedResult,
    randomNumberBetween,
    randomStr,
    replaceSpaceWithDash,
    scaleYDimension,
    secondsToMinutesAndSeconds,
    splitWithSpace,
    suffixRename,
    trimLeadingSlash,
    trimSlash,
    trimTrailingSlash,
} from '../../../src/app/utils/common';

describe('bytesToSize', () => {
    it('returns a fixed string for zero', () => {
        expect(bytesToSize(0)).toBe('0KB');
    });

    it('clamps sub-kilobyte values to the KB unit', () => {
        // sizeIndex computes to 0 for <1000 bytes and is forced up to 1 (KB).
        expect(bytesToSize(500)).toBe('0.5 KB');
    });

    it('scales into KB and MB', () => {
        expect(bytesToSize(1500)).toBe('1.5 KB');
        expect(bytesToSize(1_500_000)).toBe('1.5 MB');
    });
});

describe('time formatters', () => {
    it('formats milliseconds as mm:ss with zero-padded seconds', () => {
        expect(millisecondsToMinutesAndSeconds(65_000)).toBe('1:05');
        expect(millisecondsToMinutesAndSeconds(60_000)).toBe('1:00');
        expect(millisecondsToMinutesAndSeconds(125_000)).toBe('2:05');
    });

    it('formats milliseconds as whole minutes', () => {
        expect(millisecondsToMinutes(125_000)).toBe('2');
        expect(millisecondsToMinutes(59_000)).toBe('0');
    });

    it('formats seconds as mm:ss', () => {
        expect(secondsToMinutesAndSeconds(65)).toBe('1:05');
        expect(secondsToMinutesAndSeconds(9)).toBe('0:09');
    });
});

describe('PromiseSettledResult helpers', () => {
    const fulfilled = { status: 'fulfilled', value: 7 } as PromiseSettledResult<number>;
    const rejected = { status: 'rejected', reason: 'boom' } as PromiseSettledResult<number>;

    it('collects only fulfilled values', () => {
        expect(fulfilledPromiseSettledResult([fulfilled, rejected, fulfilled])).toEqual([7, 7]);
    });

    it('reads a single fulfilled value or undefined', () => {
        expect(promiseFulfilledResult(fulfilled)).toBe(7);
        expect(promiseFulfilledResult(rejected)).toBeUndefined();
    });

    it('reads a single rejection reason or undefined', () => {
        expect(promiseRejectedResult(rejected)).toBe('boom');
        expect(promiseRejectedResult(fulfilled)).toBeUndefined();
    });
});

describe('binarySearch', () => {
    const items = [1, 3, 5, 7, 9, 11];
    const matcherFor = (target: number) => (item: number): -1 | 0 | 1 =>
        item === target ? 0 : item > target ? 1 : -1;

    it('finds an existing element', () => {
        expect(binarySearch(items, matcherFor(7))).toBe(7);
        expect(binarySearch(items, matcherFor(1))).toBe(1);
        expect(binarySearch(items, matcherFor(11))).toBe(11);
    });

    it('returns undefined when no element matches', () => {
        expect(binarySearch(items, matcherFor(4))).toBeUndefined();
        expect(binarySearch([], matcherFor(1))).toBeUndefined();
    });
});

describe('numeric helpers', () => {
    it('returns the only value when min equals max', () => {
        expect(randomNumberBetween(5, 5)).toBe(5);
    });

    it('stays within the inclusive range', () => {
        for (let i = 0; i < 100; i += 1) {
            const n = randomNumberBetween(2, 6);
            expect(n).toBeGreaterThanOrEqual(2);
            expect(n).toBeLessThanOrEqual(6);
        }
    });

    it('scales a Y dimension by the X scale factor', () => {
        expect(scaleYDimension(100, 50, 80)).toBe(40);
        expect(scaleYDimension(10, 10, 99)).toBe(99);
    });
});

describe('parseGeoUri', () => {
    it('extracts latitude and longitude from a geo: uri', () => {
        expect(parseGeoUri('geo:1.5,2.5;u=10')).toEqual({ latitude: '1.5', longitude: '2.5' });
    });
});

describe('slash trimming', () => {
    it('trims leading, trailing, and both', () => {
        expect(trimLeadingSlash('///a/b')).toBe('a/b');
        expect(trimTrailingSlash('a/b///')).toBe('a/b');
        expect(trimSlash('//a/b//')).toBe('a/b');
    });
});

describe('nameInitials', () => {
    it('takes the requested number of leading characters', () => {
        expect(nameInitials('John')).toBe('J');
        expect(nameInitials('Jane Doe', 2)).toBe('Ja');
    });

    it('falls back to a single placeholder char for empty input', () => {
        const fallback = nameInitials('');
        expect(fallback).toHaveLength(1);
        expect(nameInitials(null)).toBe(fallback);
        expect(nameInitials(undefined)).toBe(fallback);
    });
});

describe('randomStr', () => {
    it('produces an uppercase string of the requested length', () => {
        expect(randomStr(10)).toMatch(/^[A-Z]{10}$/);
        expect(randomStr()).toHaveLength(12);
    });
});

describe('suffixRename', () => {
    it('returns the first suffixed name the validator rejects', () => {
        // validator true means "still taken" -> keep incrementing.
        expect(suffixRename('file', (n) => n === 'file1')).toBe('file2');
    });

    it('returns suffix 1 when the first candidate is free', () => {
        expect(suffixRename('file', () => false)).toBe('file1');
    });
});

describe('string splitting', () => {
    it('replaces spaces with dashes', () => {
        expect(replaceSpaceWithDash('a b c')).toBe('a-b-c');
    });

    it('splits on spaces and yields [] for blank input', () => {
        expect(splitWithSpace('a b c')).toEqual(['a', 'b', 'c']);
        expect(splitWithSpace('   ')).toEqual([]);
        expect(splitWithSpace('')).toEqual([]);
    });
});
