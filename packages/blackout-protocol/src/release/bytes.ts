/**
 * Byte helpers for release identities: the dead-drop suite's base64 and
 * UTF-8 codecs, plus what a signed byte format needs on top of them (one
 * encoding per value, length prefixes, labels, hex) and WebCrypto digests.
 *
 * `docs/security/release-identities-2026-10-26.md` fixes every format built
 * from these.
 */

import {
    bytesEqual,
    fromBase64,
    toBase64,
    utf8Decode,
    utf8Encode,
} from '../deaddrop/crypto/encoding';

export { bytesEqual, toBase64, utf8Decode, utf8Encode };

export const subtleCrypto = (): SubtleCrypto => {
    if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
        throw new Error('WebCrypto SubtleCrypto is not available');
    }
    return globalThis.crypto.subtle;
};

// TS 5.7+ narrowed `BufferSource` to `ArrayBufferView<ArrayBuffer>`; the
// dead-drop suite uses the same one cast (`deaddrop/crypto/hkdf.ts`).
export const asBufferSource = (bytes: Uint8Array): BufferSource => bytes as unknown as BufferSource;

export const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
    let total = 0;
    for (const part of parts) total += part.length;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
};

export const u16be = (value: number): Uint8Array => {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
        throw new Error(`not a 16-bit length: ${value}`);
    }
    return Uint8Array.of(value >>> 8, value & 0xff);
};

export const u32be = (value: number): Uint8Array => {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
        throw new Error(`not a 32-bit number: ${value}`);
    }
    return Uint8Array.of(
        (value >>> 24) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 8) & 0xff,
        value & 0xff
    );
};

/** A field of variable length: its byte length as 16-bit big-endian, then the bytes. */
export const lengthPrefixed = (bytes: Uint8Array): Uint8Array =>
    concatBytes(u16be(bytes.length), bytes);

/**
 * A domain label: its ASCII bytes, then one 0x00. The terminator means no
 * label is a prefix of another (`…-v1` against a later `…-v10`).
 */
export const labelBytes = (label: string): Uint8Array =>
    concatBytes(utf8Encode(label), Uint8Array.of(0));

export const toHex = (bytes: Uint8Array): string =>
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

/** Lowercase hex of exactly `length` bytes, or null. */
export const fromHex = (value: unknown, length: number): Uint8Array | null => {
    if (typeof value !== 'string' || value.length !== length * 2) return null;
    if (!/^[0-9a-f]*$/.test(value)) return null;
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
        out[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
};

/** The length of the standard padded base64 of `length` bytes. */
const base64Length = (length: number): number => 4 * Math.ceil(length / 3);

/**
 * Standard padded base64 of exactly `length` bytes, or null. The dead-drop
 * decoder skips whitespace and ignores non-zero trailing bits, so `AA==` and
 * `AB==` decode alike; a value is accepted here only if encoding what it
 * decodes to gives back the same string, so one value has one form. When a
 * length is given, a string of any other length than that many bytes encode
 * to is refused before anything is decoded, so a very long string from a
 * server costs nothing (the envelope review, P3-L5).
 */
export const decodeCanonicalBase64 = (value: unknown, length?: number): Uint8Array | null => {
    if (typeof value !== 'string' || value.length === 0) return null;
    if (length !== undefined && value.length !== base64Length(length)) return null;
    let decoded: Uint8Array;
    try {
        decoded = fromBase64(value);
    } catch {
        return null;
    }
    if (length !== undefined && decoded.length !== length) return null;
    if (toBase64(decoded) !== value) return null;
    return decoded;
};

export const toBase64Url = (bytes: Uint8Array): string =>
    toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Unpadded base64url of exactly `length` bytes (a JWK member), or null. */
export const decodeBase64Url = (value: unknown, length: number): Uint8Array | null => {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
    const standard = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4);
    const decoded = decodeCanonicalBase64(padded, length);
    if (!decoded || toBase64Url(decoded) !== value) return null;
    return decoded;
};

export const sha256 = async (bytes: Uint8Array): Promise<Uint8Array> =>
    new Uint8Array(await subtleCrypto().digest('SHA-256', asBufferSource(bytes)));

export const sha512 = async (bytes: Uint8Array): Promise<Uint8Array> =>
    new Uint8Array(await subtleCrypto().digest('SHA-512', asBufferSource(bytes)));

/** True when WebCrypto refused an algorithm it does not implement. */
export const isNotSupportedError = (cause: unknown): boolean =>
    typeof cause === 'object' &&
    cause !== null &&
    (cause as { name?: unknown }).name === 'NotSupportedError';
