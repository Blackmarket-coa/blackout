/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { EncryptedPayloadStore } from "../../src/p2p";

describe("EncryptedPayloadStore", () => {
    it("stores encrypted payload and can decrypt locally", async () => {
        const store = new EncryptedPayloadStore();

        await store.put("!room:example.org", "message-1", "hello");

        const encrypted = await store.get("!room:example.org", "message-1");
        expect(encrypted).not.toBeNull();
        expect(encrypted!.cipherText).toBeInstanceOf(Uint8Array);

        const plaintext = await store.readPlainText("!room:example.org", "message-1");
        expect(plaintext).toEqual("hello");
    });

    it("stores chunk index and verifies merkle root", async () => {
        const store = new EncryptedPayloadStore();
        const payload = "x".repeat(300_000);

        const index = await store.putChunked("!room:example.org", "message-2", payload);
        expect(index.chunkHashes.length).toBeGreaterThan(1);

        const storedIndex = await store.getChunkIndex("!room:example.org", "message-2");
        expect(storedIndex?.merkleRoot).toEqual(index.merkleRoot);

        const verified = await store.verifyMerkleRoot("!room:example.org", "message-2", index.merkleRoot);
        expect(verified).toBe(true);
    });
});
