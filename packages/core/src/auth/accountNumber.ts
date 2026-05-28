/**
 * No-PII "account number" credentials (Mullvad-style).
 *
 * A new account is identified solely by a high-entropy random number — no
 * email, phone, or username. The number IS the credential: it's used as the
 * Matrix account password, and the Matrix localpart is derived from it via a
 * one-way hash so the public user id never leaks the secret. Lose the number,
 * lose the account (there is no recovery — surface that in the UI).
 *
 * Pure + runtime-agnostic: generation uses Web Crypto `getRandomValues` and
 * derivation uses SubtleCrypto SHA-256, both available in browsers and Node 18+.
 */

// RFC 4648 base32, lowercased so it slots straight into a Matrix localpart
// (`[a-z0-9._=/+-]`) and reads without case ambiguity. Excludes 0/1/8/9.
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

const toBase32 = (bytes: Uint8Array): string => {
    let bits = 0;
    let value = 0;
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) {
        value = (value << 8) | bytes[i];
        bits += 8;
        while (bits >= 5) {
            out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) {
        out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }
    return out;
};

/** 128-bit secret → 26 base32 chars. */
const ACCOUNT_NUMBER_BYTES = 16;
export const ACCOUNT_NUMBER_LENGTH = Math.ceil((ACCOUNT_NUMBER_BYTES * 8) / 5);

const webCrypto = (): Crypto => {
    const c = (globalThis as unknown as { crypto?: Crypto }).crypto;
    if (!c || typeof c.getRandomValues !== 'function' || !c.subtle) {
        throw new Error('Web Crypto (getRandomValues + subtle) is unavailable in this runtime');
    }
    return c;
};

/** Canonical form: lowercase, separators stripped. */
export const normalizeAccountNumber = (input: string): string =>
    input.replace(/[^a-z0-9]/gi, '').toLowerCase();

/** Generate a fresh account number in canonical (normalized) form. */
export const generateAccountNumber = (): string => {
    const bytes = new Uint8Array(ACCOUNT_NUMBER_BYTES);
    webCrypto().getRandomValues(bytes);
    return toBase32(bytes);
};

export const isValidAccountNumber = (input: string): boolean => {
    const normalized = normalizeAccountNumber(input);
    return normalized.length === ACCOUNT_NUMBER_LENGTH && /^[a-z2-7]+$/.test(normalized);
};

/** Group into 4-char blocks for display, e.g. `b7k2-9qx4-...`. */
export const formatAccountNumber = (number: string): string =>
    (normalizeAccountNumber(number).match(/.{1,4}/g) ?? []).join('-');

/**
 * Derive the Matrix localpart from an account number via SHA-256 (one-way, so
 * the public mxid doesn't reveal the secret). Deterministic: the client derives
 * the same localpart at login time that the server used at provisioning time.
 */
export const accountNumberToLocalpart = async (number: string): Promise<string> => {
    const normalized = normalizeAccountNumber(number);
    const data = new TextEncoder().encode(`blackout-acct:${normalized}`);
    const digest = await webCrypto().subtle.digest('SHA-256', data);
    return `b${toBase32(new Uint8Array(digest)).slice(0, 20)}`;
};
