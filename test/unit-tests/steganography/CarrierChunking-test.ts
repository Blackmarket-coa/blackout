/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { decodeEmoji, encodeEmoji } from "../../../src/steganography/EmojiStego";
import {
    chunkEmojiCarrier,
    parseCarrierChunk,
    reassembleEmojiCarrier,
} from "../../../src/steganography/CarrierChunking";
import { StegoStrategy } from "../../../src/steganography/types";

describe("CarrierChunking", () => {
    it("deterministically chunks and reassembles a carrier", () => {
        const payload = new TextEncoder().encode("hello deterministic chunking");
        const carrier = encodeEmoji(payload, Date.now() + 1_000_000, StegoStrategy.EmojiString);

        const chunksA = chunkEmojiCarrier(carrier, 8);
        const chunksB = chunkEmojiCarrier(carrier, 8);

        expect(chunksA).toEqual(chunksB);
        expect(chunksA.length).toBeGreaterThan(1);

        const reassembled = reassembleEmojiCarrier(chunksA);
        const decoded = decodeEmoji(reassembled);

        expect(decoded).not.toBeNull();
        expect(Array.from(decoded!.payload)).toEqual(Array.from(payload));
    });

    it("parses chunk metadata", () => {
        const parsed = parseCarrierChunk("mxstego:v1:2/5:🐶🐱");
        expect(parsed).toEqual({ index: 2, total: 5, payload: "🐶🐱" });
    });

    it("rejects missing chunks on reassembly", () => {
        expect(() => reassembleEmojiCarrier(["mxstego:v1:1/2:🐶"])).toThrow("Expected 2 chunks");
    });
});
