/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { AppendOnlyEventLog } from "../../../src/services/self-healing/AppendOnlyEventLog";
import {
    decryptPayloadEnvelope,
    deriveAesKeyFromSharedSecret,
    encryptPayloadEnvelope,
} from "../../../src/services/self-healing/EncryptedPayloadEnvelope";

describe("Self-healing replay integration", () => {
    it("rebuilds deterministic state from encrypted payloads", async () => {
        const key = await deriveAesKeyFromSharedSecret(new Uint8Array(32).fill(5));
        const log = new AppendOnlyEventLog(async () => true);

        const payload1 = await encryptPayloadEnvelope("event:1", key, "key-a", "evt-1");
        const plaintext1 = await decryptPayloadEnvelope(payload1, key);

        const event1 = {
            eventId: "evt-1",
            payload: plaintext1,
            previousHash: "genesis",
            contentHash: AppendOnlyEventLog.computeContentHash(plaintext1),
            actorPublicKey: "ed25519:alice",
            signature: "sig-1",
        };

        const payload2 = await encryptPayloadEnvelope("event:2", key, "key-a", "evt-2");
        const plaintext2 = await decryptPayloadEnvelope(payload2, key);

        const event2 = {
            eventId: "evt-2",
            payload: plaintext2,
            previousHash: event1.contentHash,
            contentHash: AppendOnlyEventLog.computeContentHash(plaintext2),
            actorPublicKey: "ed25519:alice",
            signature: "sig-2",
        };

        await expect(log.ingest(event1)).resolves.toEqual({ accepted: true });
        await expect(log.ingest(event2)).resolves.toEqual({ accepted: true });

        expect(log.rebuildState()).toBe("event:1\nevent:2");
    });

    it("rejects duplicate events in replay path", async () => {
        const log = new AppendOnlyEventLog(async () => true);

        const payload = "event:1";
        const event = {
            eventId: "evt-1",
            payload,
            previousHash: "genesis",
            contentHash: AppendOnlyEventLog.computeContentHash(payload),
            actorPublicKey: "ed25519:alice",
            signature: "sig-1",
        };

        await expect(log.ingest(event)).resolves.toEqual({ accepted: true });
        await expect(log.ingest(event)).resolves.toEqual({ accepted: false, reason: "DUPLICATE_EVENT" });
    });
});
