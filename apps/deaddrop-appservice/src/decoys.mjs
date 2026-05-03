/**
 * Server-side decoy generator — JS twin of
 * `packages/blackout-protocol/src/deaddrop/crypto/decoys.ts`.
 *
 * Produces envelopes that are byte-for-byte indistinguishable in shape
 * (same field set, same field byte lengths) from real envelopes for the
 * same room/bucket. Recipients silently fail to decrypt them.
 *
 * Determinism: derived from a per-room seed + counter via HKDF-SHA-256
 * so a given (seed, counter, bucket) always yields the same decoy. This
 * lets us replay-test decoy stability and avoids storing decoys.
 */

import { hkdfSync } from 'node:crypto';

const SUITE = 'sealedbox-x25519-aes256gcm-v1';
const SALT = new TextEncoder().encode('blackout-deaddrop-decoy-v1');

const toBase64 = (bytes) => Buffer.from(bytes).toString('base64');

export const generateDecoy = ({ seed, counter, bucketBytes, paddingStrategy, expiresAt }) => {
    const info = new TextEncoder().encode(`decoy:${counter}`);
    const totalBytes = 16 + 32 + 12 + (bucketBytes + 16) + 16;
    const stream = new Uint8Array(hkdfSync('sha256', seed, SALT, info, totalBytes));

    let offset = 0;
    const take = (n) => {
        const out = stream.slice(offset, offset + n);
        offset += n;
        return out;
    };

    const clue = take(16);
    const ek = take(32);
    const nonce = take(12);
    const ct = take(bucketBytes + 16);
    const dropIdBytes = take(16);
    const dropId = Array.from(dropIdBytes, (b) => b.toString(16).padStart(2, '0')).join('');

    return {
        v: 1,
        suite: SUITE,
        pad: paddingStrategy,
        dropId,
        clue: toBase64(clue),
        ek: toBase64(ek),
        nonce: toBase64(nonce),
        ct: toBase64(ct),
        expiresAt,
    };
};
