/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

/**
 * Steganography utility for encoding and decoding hidden messages within
 * cover text using zero-width Unicode characters. Supports optional
 * AES-GCM encryption with a user-provided passphrase.
 *
 * Zero-width characters used:
 *   - U+200B (ZERO WIDTH SPACE)       → binary 0
 *   - U+200C (ZERO WIDTH NON-JOINER)  → binary 1
 *   - U+200D (ZERO WIDTH JOINER)      → byte separator
 *   - U+FEFF (ZERO WIDTH NO-BREAK SPACE) → start/end marker
 */

const ZW_0 = "\u200B"; // binary 0
const ZW_1 = "\u200C"; // binary 1
const ZW_SEP = "\u200D"; // byte separator
const ZW_MARKER = "\uFEFF"; // start/end marker

function getWebCrypto(): Crypto {
    const webCrypto = globalThis.crypto ?? (typeof window !== "undefined" ? window.crypto : undefined);
    if (!webCrypto?.subtle) {
        throw new Error("Web Crypto API is not available in this environment.");
    }

    return webCrypto;
}

/**
 * Derive an AES-GCM key from a passphrase using PBKDF2.
 */
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
    const webCrypto = getWebCrypto();
    const encoder = new TextEncoder();
    const keyMaterial = await webCrypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, [
        "deriveKey",
    ]);

    return webCrypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt as BufferSource,
            iterations: 100000,
            hash: "SHA-256",
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
    );
}

/**
 * Encrypt plaintext with AES-GCM using a passphrase.
 * Returns a Uint8Array of: salt (16) + iv (12) + ciphertext.
 */
async function encryptData(plaintext: string, passphrase: string): Promise<Uint8Array> {
    const webCrypto = getWebCrypto();
    const encoder = new TextEncoder();
    const salt = webCrypto.getRandomValues(new Uint8Array(16));
    const iv = webCrypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt);

    const ciphertext = await webCrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plaintext));

    const result = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
    result.set(salt, 0);
    result.set(iv, salt.length);
    result.set(new Uint8Array(ciphertext), salt.length + iv.length);
    return result;
}

/**
 * Decrypt ciphertext produced by `encryptData`.
 */
async function decryptData(data: Uint8Array, passphrase: string): Promise<string> {
    const webCrypto = getWebCrypto();
    const salt = Uint8Array.from(data.subarray(0, 16));
    const iv = Uint8Array.from(data.subarray(16, 28));
    const ciphertext = Uint8Array.from(data.subarray(28));
    const key = await deriveKey(passphrase, salt);

    const plaintext = await webCrypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);

    return new TextDecoder().decode(plaintext);
}

/**
 * Convert a byte array to a zero-width character string.
 */
function bytesToZeroWidth(bytes: Uint8Array): string {
    const parts: string[] = [];
    for (const byte of bytes) {
        const bits = byte.toString(2).padStart(8, "0");
        parts.push(
            bits
                .split("")
                .map((b) => (b === "0" ? ZW_0 : ZW_1))
                .join(""),
        );
    }
    return ZW_MARKER + parts.join(ZW_SEP) + ZW_MARKER;
}

/**
 * Convert a zero-width character string back to a byte array.
 */
function zeroWidthToBytes(encoded: string): Uint8Array {
    // Strip markers
    const inner = encoded.replace(new RegExp(ZW_MARKER, "g"), "");
    const byteStrings = inner.split(ZW_SEP);
    const bytes = new Uint8Array(byteStrings.length);
    for (let i = 0; i < byteStrings.length; i++) {
        let value = 0;
        for (const ch of byteStrings[i]) {
            value = (value << 1) | (ch === ZW_1 ? 1 : 0);
        }
        bytes[i] = value;
    }
    return bytes;
}

/**
 * Encode a hidden message into a cover text.
 *
 * @param coverText - The visible text that will carry the hidden message
 * @param secretMessage - The message to hide
 * @param passphrase - Optional passphrase for AES-GCM encryption
 * @returns The cover text with the hidden message embedded
 */
export async function encodeSteganographyMessage(
    coverText: string,
    secretMessage: string,
    passphrase?: string,
): Promise<string> {
    let payload: Uint8Array;

    if (passphrase) {
        payload = await encryptData(secretMessage, passphrase);
    } else {
        payload = new TextEncoder().encode(secretMessage);
    }

    const encoded = bytesToZeroWidth(payload);

    // Insert the hidden data in the middle of the cover text
    const mid = Math.floor(coverText.length / 2);
    return coverText.slice(0, mid) + encoded + coverText.slice(mid);
}

/**
 * Decode a hidden message from text that contains steganographic content.
 *
 * @param text - The text potentially containing a hidden message
 * @param passphrase - Optional passphrase for decryption
 * @returns The decoded hidden message, or null if none found
 */
export async function decodeSteganographyMessage(text: string, passphrase?: string): Promise<string | null> {
    const markerRegex = new RegExp(`${ZW_MARKER}([${ZW_0}${ZW_1}${ZW_SEP}]+)${ZW_MARKER}`);
    const match = text.match(markerRegex);
    if (!match) return null;

    const bytes = zeroWidthToBytes(match[0]);

    if (passphrase) {
        try {
            return await decryptData(bytes, passphrase);
        } catch {
            throw new Error("Decryption failed. Wrong passphrase or corrupted data.");
        }
    }

    return new TextDecoder().decode(bytes);
}

/**
 * Check if text contains a steganographic message.
 */
export function containsSteganographyMessage(text: string): boolean {
    const markerRegex = new RegExp(`${ZW_MARKER}([\u200B\u200C\u200D]+)${ZW_MARKER}`);
    return markerRegex.test(text);
}

/**
 * Strip all steganographic content from text, returning clean visible text.
 */
export function stripSteganographyContent(text: string): string {
    return Array.from(text)
        .filter((char) => char !== ZW_0 && char !== ZW_1 && char !== ZW_SEP && char !== ZW_MARKER)
        .join("");
}
