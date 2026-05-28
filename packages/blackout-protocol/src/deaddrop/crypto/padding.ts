/**
 * Fixed-size padding buckets, PrivateBin-style.
 *
 * Padding hides the true plaintext length from a server / network observer.
 * Plaintext is padded with ISO/IEC 7816-4 (one 0x80 byte then 0x00 bytes)
 * so the original length is recoverable client-side.
 *
 * Two strategies:
 *  - 'minimal': pad to next 256-byte boundary (free tier; defeats trivial
 *    size leaks but does not provide bucket-grade indistinguishability).
 *  - 'bucket' : pad to one of a small fixed bucket set so that two
 *    payloads in the same bucket are indistinguishable by length.
 */

import { randomBytes } from './random';

export type PaddingStrategy = 'minimal' | 'bucket';

export const BUCKETS: readonly number[] = [
    1024,
    16 * 1024,
    256 * 1024,
    1024 * 1024,
    16 * 1024 * 1024,
    128 * 1024 * 1024,
] as const;

export const ABSOLUTE_MAX = BUCKETS[BUCKETS.length - 1];

const selectBucket = (plaintextLength: number): number => {
    if (plaintextLength < 0) throw new Error('plaintextLength must be non-negative');
    for (const bucket of BUCKETS) {
        if (plaintextLength + 16 <= bucket) return bucket;
    }
    throw new Error(
        `payload of ${plaintextLength} bytes exceeds the largest padding bucket (${ABSOLUTE_MAX})`
    );
};

const minimalPaddedLength = (plaintextLength: number): number => {
    const overhead = 1; // mandatory 0x80 marker
    const total = plaintextLength + overhead;
    return Math.ceil(total / 256) * 256;
};

/**
 * Pad plaintext to a target length using ISO/IEC 7816-4 (a single 0x80
 * byte followed by 0x00 bytes). The padded array is filled with random
 * bytes first to ensure the cipher block layout doesn't expose structural
 * zeroes if the plaintext happens to end on a boundary minus one.
 */
export const pad = (
    plaintext: Uint8Array,
    strategy: PaddingStrategy
): { padded: Uint8Array; bucket: number } => {
    if (!Number.isInteger(plaintext.length) || plaintext.length < 0) {
        throw new Error('plaintextLength must be a non-negative integer');
    }
    if (plaintext.length > ABSOLUTE_MAX - 1) {
        throw new Error(
            `payload of ${plaintext.length} bytes exceeds the maximum allowed size (${ABSOLUTE_MAX - 1})`
        );
    }
    const target =
        strategy === 'bucket'
            ? selectBucket(plaintext.length)
            : minimalPaddedLength(plaintext.length);
    if (target < plaintext.length + 1) {
        throw new Error('padding bucket too small for plaintext');
    }
    const padded = randomBytes(target);
    padded.set(plaintext, 0);
    padded[plaintext.length] = 0x80;
    for (let i = plaintext.length + 1; i < target; i += 1) padded[i] = 0x00;
    return { padded, bucket: target };
};

export const unpad = (padded: Uint8Array): Uint8Array => {
    let i = padded.length - 1;
    while (i >= 0 && padded[i] === 0x00) i -= 1;
    if (i < 0 || padded[i] !== 0x80) {
        throw new Error('invalid ISO/IEC 7816-4 padding');
    }
    return padded.slice(0, i);
};

export const isBucketSize = (size: number): boolean => BUCKETS.includes(size);
