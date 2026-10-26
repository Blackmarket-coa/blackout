/**
 * Reversible XOR obfuscation, URL-encoded. It is not encryption and it is not
 * steganography: whoever holds `key` reads the text, and on the one path that
 * uses it (the API message endpoint's tier 3, `packages/api/src/routes/messages.ts`)
 * the key is the server's `STEGO_KEY`. It exists so a stored tier-3 message is
 * not readable at a glance by a bridged chat viewer, and for nothing else.
 *
 * This module used to export `encryptE2E` / `decryptE2E` (this XOR against the
 * first 16 characters of a "public key" that was a server-minted random
 * string) and `signMessage` / `verifySignature` (`'<signer>:<content>'`,
 * URL-encoded). Neither was cryptography and nothing may build on them; they
 * were removed on 2026-10-25 (docs/security/api-findings-triage-2026-10-25.md,
 * finding 3). Real end-to-end encryption in Blackout is Matrix's (Megolm, via
 * matrix-js-sdk's Rust crypto) and the dead-drop envelope in
 * `packages/blackout-protocol`.
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
