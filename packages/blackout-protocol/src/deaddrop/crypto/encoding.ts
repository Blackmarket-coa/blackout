/**
 * Constant-time-ish base64 + utf-8 helpers. Used everywhere in the crypto
 * core so callers never touch raw Buffer / atob.
 */

const STD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export const toBase64 = (bytes: Uint8Array): string => {
    let out = '';
    let i = 0;
    for (; i + 3 <= bytes.length; i += 3) {
        const triplet = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
        out +=
            STD_ALPHABET[(triplet >> 18) & 0x3f] +
            STD_ALPHABET[(triplet >> 12) & 0x3f] +
            STD_ALPHABET[(triplet >> 6) & 0x3f] +
            STD_ALPHABET[triplet & 0x3f];
    }
    const remaining = bytes.length - i;
    if (remaining === 1) {
        const triplet = bytes[i] << 16;
        out += STD_ALPHABET[(triplet >> 18) & 0x3f];
        out += STD_ALPHABET[(triplet >> 12) & 0x3f];
        out += '==';
    } else if (remaining === 2) {
        const triplet = (bytes[i] << 16) | (bytes[i + 1] << 8);
        out += STD_ALPHABET[(triplet >> 18) & 0x3f];
        out += STD_ALPHABET[(triplet >> 12) & 0x3f];
        out += STD_ALPHABET[(triplet >> 6) & 0x3f];
        out += '=';
    }
    return out;
};

export const fromBase64 = (input: string): Uint8Array => {
    const cleaned = input.replace(/\s+/g, '');
    if (cleaned.length === 0) return new Uint8Array(0);
    if (cleaned.length % 4 !== 0) {
        throw new Error('base64 length must be a multiple of 4');
    }
    const lookup = new Int16Array(128).fill(-1);
    for (let i = 0; i < STD_ALPHABET.length; i += 1) {
        lookup[STD_ALPHABET.charCodeAt(i)] = i;
    }
    const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
    const out = new Uint8Array((cleaned.length / 4) * 3 - padding);
    let offset = 0;
    for (let i = 0; i < cleaned.length; i += 4) {
        const a = lookup[cleaned.charCodeAt(i)];
        const b = lookup[cleaned.charCodeAt(i + 1)];
        const c = cleaned[i + 2] === '=' ? 0 : lookup[cleaned.charCodeAt(i + 2)];
        const d = cleaned[i + 3] === '=' ? 0 : lookup[cleaned.charCodeAt(i + 3)];
        if (a < 0 || b < 0 || c < 0 || d < 0) {
            throw new Error('invalid base64 character');
        }
        const triplet = (a << 18) | (b << 12) | (c << 6) | d;
        if (offset < out.length) out[offset++] = (triplet >> 16) & 0xff;
        if (offset < out.length) out[offset++] = (triplet >> 8) & 0xff;
        if (offset < out.length) out[offset++] = triplet & 0xff;
    }
    return out;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const utf8Encode = (text: string): Uint8Array => textEncoder.encode(text);
export const utf8Decode = (bytes: Uint8Array): string => textDecoder.decode(bytes);

/** Constant-time byte comparison. */
export const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean => {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
    return diff === 0;
};
