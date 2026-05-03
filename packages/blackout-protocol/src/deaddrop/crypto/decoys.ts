/**
 * Deterministic decoy envelope generator.
 *
 * Server-side helper used to pad `/fetch` responses with decoy envelopes
 * that are byte-length and structurally indistinguishable from real
 * envelopes for the same room/bucket. Drawn from SecureDrop Protocol's
 * decoy-on-every-request design.
 *
 * Decoys are HKDF-derived from a per-room seed + a fetch counter so they
 * are deterministic for a given seed (good for testing) and require no
 * persistent storage on the server side beyond the seed itself.
 */

import { hkdfSha256 } from './hkdf';
import { toBase64, utf8Encode } from './encoding';
import {
    ENVELOPE_VERSION,
    SUPPORTED_SUITES,
    type DeadDropEnvelopeV1,
} from './envelope';
import type { PaddingStrategy } from './padding';

const SALT = utf8Encode('blackout-deaddrop-decoy-v1');

export type DecoyParams = {
    seed: Uint8Array;
    counter: number;
    bucketBytes: number;
    paddingStrategy: PaddingStrategy;
    expiresAt: string;
};

export const generateDecoy = async (
    params: DecoyParams
): Promise<DeadDropEnvelopeV1> => {
    const counterBytes = utf8Encode(`decoy:${params.counter}`);
    const stream = await hkdfSha256(
        params.seed,
        SALT,
        counterBytes,
        16 + 32 + 12 + params.bucketBytes + 16 + 16
    );

    const offset = { i: 0 };
    const take = (n: number): Uint8Array => {
        const out = stream.slice(offset.i, offset.i + n);
        offset.i += n;
        return out;
    };

    const clue = take(16);
    const ek = take(32);
    const nonce = take(12);
    const ct = take(params.bucketBytes + 16); // include 16-byte AEAD tag
    const dropIdBytes = take(16);
    const dropId = Array.from(dropIdBytes, (b) =>
        b.toString(16).padStart(2, '0')
    ).join('');

    return {
        v: ENVELOPE_VERSION,
        suite: SUPPORTED_SUITES[0],
        pad: params.paddingStrategy,
        dropId,
        clue: toBase64(clue),
        ek: toBase64(ek),
        nonce: toBase64(nonce),
        ct: toBase64(ct),
        expiresAt: params.expiresAt,
    };
};
