/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { decodeEmoji, encodeEmoji } from "../../../src/steganography/EmojiStego";
import { normalizeIncomingCarrier, prepareCarrierForTransport } from "../../../src/steganography/CarrierTransport";
import { StegoStrategy } from "../../../src/steganography/types";

function randomBytes(length: number): Uint8Array {
    const data = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        data[i] = Math.floor(Math.random() * 256);
    }
    return data;
}

describe("CarrierTransport property-style checks", () => {
    it("round-trips random emoji carriers across deterministic chunking", () => {
        for (let i = 0; i < 75; i++) {
            const payloadLen = 1 + Math.floor(Math.random() * 96);
            const payload = randomBytes(payloadLen);
            const encoded = encodeEmoji(payload, Date.now() + 60000, StegoStrategy.EmojiString);

            const prepared = prepareCarrierForTransport(encoded, StegoStrategy.EmojiString, 7 + (i % 9));
            const normalized = normalizeIncomingCarrier(prepared.carrier);
            const decoded = decodeEmoji(normalized);

            expect(decoded).not.toBeNull();
            expect(Array.from(decoded!.payload)).toEqual(Array.from(payload));
        }
    });

    it("does not normalize partially corrupted chunk frames", () => {
        const payload = randomBytes(32);
        const encoded = encodeEmoji(payload, Date.now() + 60000, StegoStrategy.EmojiString);

        const prepared = prepareCarrierForTransport(encoded, StegoStrategy.EmojiString, 8);
        const lines = prepared.carrier.split("\n");
        expect(lines.length).toBeGreaterThan(1);

        // Corrupt the chunk index so reassembly must fail and fallback to raw carrier occurs.
        lines[0] = lines[0].replace(/\d+\/\d+:/, "x/99:");
        const corrupted = lines.join("\n");

        expect(normalizeIncomingCarrier(corrupted)).toEqual(corrupted);
    });
});
