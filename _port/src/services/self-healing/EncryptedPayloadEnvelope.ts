/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

export interface EncryptedPayloadEnvelope {
    algorithm: "A256GCM";
    keyId: string;
    iv: string;
    ciphertext: string;
    aad?: string;
}

function bytesToBase64(data: Uint8Array): string {
    const BufferCtor = (globalThis as { Buffer?: { from(data: Uint8Array): { toString(enc: string): string } } }).Buffer;
    if (BufferCtor) {
        return BufferCtor.from(data).toString("base64");
    }

    let binary = "";
    for (const byte of data) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
    const BufferCtor = (globalThis as { Buffer?: { from(data: string, enc: string): Uint8Array } }).Buffer;
    if (BufferCtor) {
        return new Uint8Array(BufferCtor.from(base64, "base64"));
    }

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

async function importAesKey(key: Uint8Array): Promise<CryptoKey> {
    return crypto.subtle.importKey("raw", key, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function deriveAesKeyFromSharedSecret(sharedSecret: Uint8Array): Promise<Uint8Array> {
    const digest = await crypto.subtle.digest("SHA-256", sharedSecret);
    return new Uint8Array(digest);
}

export async function encryptPayloadEnvelope(
    payload: string,
    key: Uint8Array,
    keyId: string,
    aad?: string,
): Promise<EncryptedPayloadEnvelope> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cryptoKey = await importAesKey(key);
    const encoder = new TextEncoder();

    const ciphertext = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv,
            additionalData: aad ? encoder.encode(aad) : undefined,
        },
        cryptoKey,
        encoder.encode(payload),
    );

    return {
        algorithm: "A256GCM",
        keyId,
        iv: bytesToBase64(iv),
        ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
        aad,
    };
}

export async function decryptPayloadEnvelope(envelope: EncryptedPayloadEnvelope, key: Uint8Array): Promise<string> {
    const cryptoKey = await importAesKey(key);
    const decoder = new TextDecoder();
    const plaintext = await crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: base64ToBytes(envelope.iv),
            additionalData: envelope.aad ? new TextEncoder().encode(envelope.aad) : undefined,
        },
        cryptoKey,
        base64ToBytes(envelope.ciphertext),
    );

    return decoder.decode(plaintext);
}
