/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { encodeEmoji } from "../../../src/steganography/EmojiStego";
import { normalizeIncomingCarrier, prepareCarrierForTransport } from "../../../src/steganography/CarrierTransport";
import { StegoStrategy } from "../../../src/steganography/types";

describe("CarrierTransport", () => {
    it("chunks emoji carriers for transport and reassembles on receive", () => {
        const payload = new TextEncoder().encode("transport chunking integration test payload");
        const encoded = encodeEmoji(payload, Date.now() + 3600_000, StegoStrategy.EmojiString);

        const prepared = prepareCarrierForTransport(encoded, StegoStrategy.EmojiString, 8);
        expect(prepared.chunked).toBe(true);
        expect(prepared.chunkCount).toBeGreaterThan(1);

        const normalized = normalizeIncomingCarrier(prepared.carrier);
        expect(normalized).toEqual(encoded);
    });

    it("passes through non-chunked carriers", () => {
        const raw = "not-a-chunked-carrier";
        expect(normalizeIncomingCarrier(raw)).toEqual(raw);
    });

    it("rejects invalid emoji carriers before transport", () => {
        expect(() => prepareCarrierForTransport("mxstego:v1:1/1:🐶x", StegoStrategy.Emoji)).toThrow(
            "Carrier compatibility validation failed",
        );
    });

    it("rejects transport payloads requiring too many chunks", () => {
        const payload = new Uint8Array(1200).fill(7);
        const encoded = encodeEmoji(payload, Date.now() + 3600_000, StegoStrategy.EmojiString);

        expect(() => prepareCarrierForTransport(encoded, StegoStrategy.EmojiString, 1)).toThrow(
            "Carrier exceeds transport chunk cap",
        );
    });
});
