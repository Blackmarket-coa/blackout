/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { AppendOnlyEventLog } from "../../../src/services/self-healing/AppendOnlyEventLog";

describe("AppendOnlyEventLog", () => {
    it("accepts valid events and rebuilds deterministic state", async () => {
        const log = new AppendOnlyEventLog(async () => true);

        const firstPayload = "hello";
        const first = {
            eventId: "evt-1",
            payload: firstPayload,
            previousHash: "genesis",
            contentHash: AppendOnlyEventLog.computeContentHash(firstPayload),
            actorPublicKey: "ed25519:alice",
            signature: "sig-1",
        };

        const firstResult = await log.ingest(first);
        expect(firstResult.accepted).toBe(true);

        const secondPayload = "world";
        const second = {
            eventId: "evt-2",
            payload: secondPayload,
            previousHash: first.contentHash,
            contentHash: AppendOnlyEventLog.computeContentHash(secondPayload),
            actorPublicKey: "ed25519:alice",
            signature: "sig-2",
        };

        const secondResult = await log.ingest(second);
        expect(secondResult.accepted).toBe(true);
        expect(log.length).toBe(2);
        expect(log.rebuildState()).toBe("hello\nworld");
    });

    it("rejects invalid signatures", async () => {
        const log = new AppendOnlyEventLog(async () => false);

        const payload = "hello";
        const result = await log.ingest({
            eventId: "evt-1",
            payload,
            previousHash: "genesis",
            contentHash: AppendOnlyEventLog.computeContentHash(payload),
            actorPublicKey: "ed25519:alice",
            signature: "bad-sig",
        });

        expect(result).toEqual({ accepted: false, reason: "INVALID_SIGNATURE" });
    });

    it("rejects hash-chain breaks and duplicates", async () => {
        const log = new AppendOnlyEventLog(async () => true);

        const payload = "hello";
        const event = {
            eventId: "evt-1",
            payload,
            previousHash: "genesis",
            contentHash: AppendOnlyEventLog.computeContentHash(payload),
            actorPublicKey: "ed25519:alice",
            signature: "sig-1",
        };

        await log.ingest(event);

        const duplicate = await log.ingest(event);
        expect(duplicate).toEqual({ accepted: false, reason: "DUPLICATE_EVENT" });

        const broken = await log.ingest({
            eventId: "evt-2",
            payload: "next",
            previousHash: "genesis",
            contentHash: AppendOnlyEventLog.computeContentHash("next"),
            actorPublicKey: "ed25519:alice",
            signature: "sig-2",
        });

        expect(broken).toEqual({ accepted: false, reason: "HASH_CHAIN_BREAK" });
    });
});
