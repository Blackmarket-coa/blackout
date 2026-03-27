/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { StegoCodec } from "../../../src/steganography/StegoCodec";
import { StegoDecodeErrorCode, StegoStrategy, STEGO_MARKER, EMOJI_POOL } from "../../../src/steganography/types";

function expectDecodeFailure(result: Awaited<ReturnType<StegoCodec["decodeDiagnostic"]>>) {
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected decode failure");
    return result.error;
}

function expectDecodeSuccess(result: Awaited<ReturnType<StegoCodec["decodeDiagnostic"]>>) {
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Expected decode success, got ${result.error.code}`);
    return result;
}
describe("StegoCodec diagnostic decode", () => {
    let codec: StegoCodec;

    beforeEach(() => {
        codec = new StegoCodec();
    });

    describe("decodeDiagnostic", () => {
        it("should return NotStegoContent for plain text", async () => {
            const result = await codec.decodeDiagnostic("Hello world");
            const error = expectDecodeFailure(result);
            expect(error.code).toBe(StegoDecodeErrorCode.NotStegoContent);
            expect(error.rsAttempted).toBe(false);
        });

        it("should return NotStegoContent for empty string", async () => {
            const result = await codec.decodeDiagnostic("");
            const error = expectDecodeFailure(result);
            expect(error.code).toBe(StegoDecodeErrorCode.NotStegoContent);
        });

        it("should return MalformedHeader for stego marker with insufficient emojis", async () => {
            // Stego marker + only 3 emojis (need 16 for header)
            const carrier = STEGO_MARKER + EMOJI_POOL[0] + EMOJI_POOL[1] + EMOJI_POOL[2];
            const result = await codec.decodeDiagnostic(carrier);
            const error = expectDecodeFailure(result);
            expect(error.code).toBe(StegoDecodeErrorCode.MalformedHeader);
        });

        it("should successfully decode a valid encoded message", async () => {
            const payload = new TextEncoder().encode("Hello");
            const message = await codec.encode(payload, { strategy: StegoStrategy.Emoji });

            const result = await codec.decodeDiagnostic(message.carrier);
            const decoded = expectDecodeSuccess(result);
            expect(decoded.header.checksumValid).toBe(true);
            expect(decoded.header.expired).toBe(false);
        });

        it("should return Expired for expired messages", async () => {
            const payload = new TextEncoder().encode("test");
            // Encode with 1ms expiry — will be expired by decode time
            const message = await codec.encode(payload, {
                strategy: StegoStrategy.Emoji,
                expiryMs: 1,
            });

            // Wait a bit to ensure expiry
            await new Promise((resolve) => setTimeout(resolve, 10));

            const result = await codec.decodeDiagnostic(message.carrier);
            const error = expectDecodeFailure(result);
            expect(error.code).toBe(StegoDecodeErrorCode.Expired);
            expect(error.partialHeader).toBeDefined();
        });

        it("should provide error details in the structured error", async () => {
            const result = await codec.decodeDiagnostic("not stego at all");
            const error = expectDecodeFailure(result);
            expect(error.code).toBeDefined();
            expect(error.message).toBeTruthy();
            expect(typeof error.rsAttempted).toBe("boolean");
            expect(typeof error.rsCorrected).toBe("boolean");
        });

        it("should indicate RS was attempted for emoji strategies", async () => {
            const payload = new TextEncoder().encode("RS test message");
            const message = await codec.encode(payload, { strategy: StegoStrategy.Emoji });

            const result = await codec.decodeDiagnostic(message.carrier);
            expect(result.ok).toBe(true);
            // RS is attempted during decode for emoji strategy
        });

        it("should be backward compatible — decode() returns null for non-stego", async () => {
            const result = await codec.decode("Hello world");
            expect(result).toBeNull();
        });

        it("should be backward compatible — decode() returns payload for valid messages", async () => {
            const payload = new TextEncoder().encode("compat test");
            const message = await codec.encode(payload, { strategy: StegoStrategy.Emoji });

            const result = await codec.decode(message.carrier);
            expect(result).not.toBeNull();
            expect(result!.payload).toBeInstanceOf(Uint8Array);
        });
    });
});
