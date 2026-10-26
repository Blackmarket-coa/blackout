/**
 * Reversible XOR obfuscation, URL-encoded — a copy of `packages/core/src/crypto`.
 * It is not encryption and it is not steganography: whoever holds `key` reads
 * the text. No client code calls it; it is kept only so the two copies match.
 *
 * `encryptE2E` / `decryptE2E` / `signMessage` / `verifySignature`, which this
 * file also exported, were not cryptography (an XOR against a server-minted
 * random string, and a URL-encoded join of two strings) and were removed on
 * 2026-10-25 so nothing can build on them
 * (docs/security/api-findings-triage-2026-10-25.md, finding 3). The client's
 * real end-to-end encryption is matrix-js-sdk's Rust crypto.
 */
const xorWithKey = (input: string, key: string): string => {
    if (!key) {
        return input;
    }

    const chars = [...input].map((char, index) => {
        const code = char.charCodeAt(0) ^ key.charCodeAt(index % key.length);
        return String.fromCharCode(code);
    });

    return chars.join('');
};

export function encodeStego(content: string, key: string): string {
    return encodeURIComponent(xorWithKey(content, key));
}

export function decodeStego(payload: string, key: string): string {
    const decoded = decodeURIComponent(payload);
    return xorWithKey(decoded, key);
}
