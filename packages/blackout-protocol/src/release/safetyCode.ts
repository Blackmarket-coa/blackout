/**
 * The safety code two people compare before either relies on the other's
 * release identity.
 *
 * One half per identity, as Signal's numeric fingerprints do: the first 30
 * bytes of SHA-512("blackout-release-safety-code-v1" 0x00 ‖ fingerprint),
 * read as six 5-byte big-endian numbers, each mod 100000 as five digits. The
 * code is the two halves in ascending order: 60 digits, the same on both
 * devices. A single hash over both identities would let a server that swaps
 * a key on each side search for a collision at half the code's strength;
 * with halves, each swap has to hit a fixed 30-digit target.
 *
 * Each half binds an identity's fingerprint, so its account id, its three
 * keys and the format version. What a match does and does not prove:
 * `docs/security/release-identities-2026-10-26.md` §2.
 */

import { concatBytes, fromHex, labelBytes, sha512 } from './bytes';
import { RELEASE_FINGERPRINT_BYTES } from './identity';

export const SAFETY_CODE_LABEL = 'blackout-release-safety-code-v1';
export const SAFETY_CODE_HALF_DIGITS = 30;
export const SAFETY_CODE_DIGITS = 60;
export const SAFETY_CODE_GROUP_DIGITS = 5;

const fingerprintBytes = (fingerprint: string): Uint8Array => {
    const bytes = fromHex(fingerprint, RELEASE_FINGERPRINT_BYTES);
    if (!bytes) throw new Error('safety code: a fingerprint must be 64 lowercase hex digits');
    return bytes;
};

/** One identity's 30 digits. */
export const safetyCodeHalf = async (fingerprint: string): Promise<string> => {
    const digest = await sha512(
        concatBytes(labelBytes(SAFETY_CODE_LABEL), fingerprintBytes(fingerprint))
    );
    let digits = '';
    for (let chunk = 0; chunk < SAFETY_CODE_HALF_DIGITS / SAFETY_CODE_GROUP_DIGITS; chunk += 1) {
        const at = chunk * 5;
        // 40 bits: past what JavaScript's 32-bit bitwise operators hold, so
        // built with arithmetic, which is exact below 2^53.
        const value =
            digest[at] * 2 ** 32 +
            digest[at + 1] * 2 ** 24 +
            digest[at + 2] * 2 ** 16 +
            digest[at + 3] * 2 ** 8 +
            digest[at + 4];
        digits += String(value % 100000).padStart(SAFETY_CODE_GROUP_DIGITS, '0');
    }
    return digits;
};

/** The 60-digit code over two identities, given their fingerprints. */
export const computeSafetyCode = async (
    fingerprintA: string,
    fingerprintB: string
): Promise<string> => {
    fingerprintBytes(fingerprintA);
    fingerprintBytes(fingerprintB);
    if (fingerprintA === fingerprintB) {
        throw new Error('safety code: an identity cannot be compared with itself');
    }
    const [halfA, halfB] = await Promise.all([
        safetyCodeHalf(fingerprintA),
        safetyCodeHalf(fingerprintB),
    ]);
    return halfA <= halfB ? `${halfA}${halfB}` : `${halfB}${halfA}`;
};

/** The code as twelve groups of five digits. */
export const formatSafetyCode = (code: string): string[] => {
    if (!new RegExp(`^\\d{${SAFETY_CODE_DIGITS}}$`).test(code)) {
        throw new Error('safety code: expected 60 digits');
    }
    return code.match(new RegExp(`\\d{${SAFETY_CODE_GROUP_DIGITS}}`, 'g')) ?? [];
};
