/**
 * CSPRNG helpers. Uses WebCrypto (browser + Node 22+).
 */

const cryptoRef = (): Crypto => {
    if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.getRandomValues) {
        throw new Error('WebCrypto is not available in this environment');
    }
    return globalThis.crypto;
};

export const randomBytes = (length: number): Uint8Array => {
    if (!Number.isInteger(length) || length < 0) {
        throw new Error('length must be a non-negative integer');
    }
    const out = new Uint8Array(length);
    cryptoRef().getRandomValues(out);
    return out;
};

export const randomId = (length = 16): string => {
    const bytes = randomBytes(length);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};
