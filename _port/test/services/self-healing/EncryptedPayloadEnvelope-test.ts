/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync } from "node:crypto";

import {
    decryptPayloadEnvelope,
    deriveAesKeyFromSharedSecret,
    encryptPayloadEnvelope,
} from "../../../src/services/self-healing/EncryptedPayloadEnvelope";

describe("EncryptedPayloadEnvelope", () => {
    it("round-trips encrypted payloads with AAD", async () => {
        const secret = new Uint8Array(32).fill(7);
        const key = await deriveAesKeyFromSharedSecret(secret);

        const envelope = await encryptPayloadEnvelope("federation:recover", key, "test-key", "evt-1");
        const plaintext = await decryptPayloadEnvelope(envelope, key);

        expect(envelope.algorithm).toBe("A256GCM");
        expect(plaintext).toBe("federation:recover");
    });

    it("supports x25519 shared secret -> aes key derivation", async () => {
        const alice = generateKeyPairSync("x25519");
        const bob = generateKeyPairSync("x25519");

        const aliceSecret = diffieHellman({
            privateKey: createPrivateKey(alice.privateKey.export({ format: "pem", type: "pkcs8" })),
            publicKey: createPublicKey(bob.publicKey.export({ format: "pem", type: "spki" })),
        });
        const bobSecret = diffieHellman({
            privateKey: createPrivateKey(bob.privateKey.export({ format: "pem", type: "pkcs8" })),
            publicKey: createPublicKey(alice.publicKey.export({ format: "pem", type: "spki" })),
        });

        expect(Buffer.compare(aliceSecret, bobSecret)).toBe(0);

        const key = await deriveAesKeyFromSharedSecret(new Uint8Array(aliceSecret));
        const envelope = await encryptPayloadEnvelope("room_state_sync", key, "x25519:a-b");
        const plaintext = await decryptPayloadEnvelope(envelope, key);

        expect(plaintext).toBe("room_state_sync");
    });

    it("rejects decrypt with wrong key", async () => {
        const key = await deriveAesKeyFromSharedSecret(new Uint8Array(32).fill(2));
        const wrongKey = await deriveAesKeyFromSharedSecret(new Uint8Array(32).fill(9));

        const envelope = await encryptPayloadEnvelope("message", key, "key-1");
        await expect(decryptPayloadEnvelope(envelope, wrongKey)).rejects.toThrow();
    });
});
