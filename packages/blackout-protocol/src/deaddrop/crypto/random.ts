/**
 * CSPRNG helpers. Uses WebCrypto (browser + Node 22+).
 */

const cryptoRef = (): Crypto => {
    if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.getRandomValues) {
        throw new Error('WebCrypto is not available in this environment');
    }
    return globalThis.crypto;
};

/**
 * The most `getRandomValues` fills in one call: WebCrypto throws
 * `QuotaExceededError` past 65,536 bytes.
 */
export const RANDOM_VALUES_MAX_BYTES = 65536;

/** `length` random bytes, filled in as many calls as the per-call limit needs. */
export const randomBytes = (length: number): Uint8Array => {
    if (!Number.isInteger(length) || length < 0) {
        throw new Error('length must be a non-negative integer');
    }
    const out = new Uint8Array(length);
    const crypto = cryptoRef();
    for (let offset = 0; offset < length; offset += RANDOM_VALUES_MAX_BYTES) {
        crypto.getRandomValues(
            out.subarray(offset, Math.min(offset + RANDOM_VALUES_MAX_BYTES, length))
        );
    }
    return out;
};

export const randomId = (length = 16): string => {
    const bytes = randomBytes(length);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};
