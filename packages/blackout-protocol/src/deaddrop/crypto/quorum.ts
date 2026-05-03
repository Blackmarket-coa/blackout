/**
 * Shamir Secret Sharing over GF(256), with the Rijndael irreducible
 * polynomial 0x11b. Used for k-of-n quorum dead-drop opens (Team /
 * Enterprise tiers): the AES key for a drop is split into N shares so
 * that any K members can reconstruct it client-side, but the server
 * never sees a complete key.
 *
 * Implementation is intentionally straightforward and self-contained
 * (no third-party dep) so it can be audited in isolation.
 */

import { randomBytes } from './random';
import { bytesEqual } from './encoding';

// EXP/LOG tables for GF(2^8) under Rijndael's irreducible polynomial 0x11b,
// generator g=3. log[0] is undefined; callers must guard against zero
// inputs to gfMul/gfDiv (we do).
const EXP: Uint8Array = new Uint8Array(256);
const LOG: Uint8Array = new Uint8Array(256);

(() => {
    let x = 1;
    for (let i = 0; i < 255; i += 1) {
        EXP[i] = x;
        LOG[x] = i;
        let next = (x << 1) & 0xff;
        if (x & 0x80) next ^= 0x1b;
        next ^= x; // (x*2) XOR x == x*3 in GF(256)
        x = next & 0xff;
    }
    EXP[255] = EXP[0];
})();

const gfMul = (a: number, b: number): number => {
    if (a === 0 || b === 0) return 0;
    return EXP[(LOG[a] + LOG[b]) % 255];
};

const gfDiv = (a: number, b: number): number => {
    if (b === 0) throw new Error('division by zero in GF(256)');
    if (a === 0) return 0;
    return EXP[(LOG[a] + 255 - LOG[b]) % 255];
};

/**
 * Evaluate the polynomial defined by `coeffs[0] + coeffs[1]*x + ...`
 * at the given x value, in GF(256).
 */
const evalPoly = (coeffs: Uint8Array, x: number): number => {
    let result = 0;
    let xPow = 1;
    for (let i = 0; i < coeffs.length; i += 1) {
        result ^= gfMul(coeffs[i], xPow);
        xPow = gfMul(xPow, x);
    }
    return result;
};

export type QuorumShare = {
    /** 1..255 — the x-coordinate of this share. */
    x: number;
    /** Share bytes; same length as the secret. */
    y: Uint8Array;
};

export const split = (
    secret: Uint8Array,
    threshold: number,
    shares: number
): QuorumShare[] => {
    if (!Number.isInteger(threshold) || threshold < 2) {
        throw new Error('threshold must be an integer >= 2');
    }
    if (!Number.isInteger(shares) || shares < threshold) {
        throw new Error('shares must be an integer >= threshold');
    }
    if (shares > 255) {
        throw new Error('shares cannot exceed 255 (GF(256) limit)');
    }
    if (secret.length === 0) {
        throw new Error('secret cannot be empty');
    }

    const out: QuorumShare[] = [];
    for (let i = 1; i <= shares; i += 1) {
        out.push({ x: i, y: new Uint8Array(secret.length) });
    }

    for (let byteIdx = 0; byteIdx < secret.length; byteIdx += 1) {
        const coeffs = new Uint8Array(threshold);
        coeffs[0] = secret[byteIdx];
        const random = randomBytes(threshold - 1);
        for (let j = 1; j < threshold; j += 1) coeffs[j] = random[j - 1];
        for (let i = 0; i < shares; i += 1) {
            out[i].y[byteIdx] = evalPoly(coeffs, out[i].x);
        }
    }
    return out;
};

export const combine = (shares: QuorumShare[]): Uint8Array => {
    if (shares.length < 2) {
        throw new Error('need at least 2 shares to combine');
    }
    const length = shares[0].y.length;
    for (const s of shares) {
        if (s.y.length !== length) {
            throw new Error('all shares must have the same byte length');
        }
        if (s.x === 0 || s.x > 255) {
            throw new Error('share x must be in 1..255');
        }
    }
    const xs = new Set<number>();
    for (const s of shares) {
        if (xs.has(s.x)) throw new Error('duplicate share x value');
        xs.add(s.x);
    }

    const secret = new Uint8Array(length);
    for (let byteIdx = 0; byteIdx < length; byteIdx += 1) {
        let acc = 0;
        for (let i = 0; i < shares.length; i += 1) {
            // Lagrange basis at x=0
            let num = 1;
            let den = 1;
            for (let j = 0; j < shares.length; j += 1) {
                if (i === j) continue;
                num = gfMul(num, shares[j].x);
                den = gfMul(den, shares[i].x ^ shares[j].x);
            }
            const basis = gfDiv(num, den);
            acc ^= gfMul(shares[i].y[byteIdx], basis);
        }
        secret[byteIdx] = acc;
    }
    return secret;
};

/** Convenience: are two shares structurally equal (used in tests). */
export const sharesEqual = (a: QuorumShare, b: QuorumShare): boolean =>
    a.x === b.x && bytesEqual(a.y, b.y);
