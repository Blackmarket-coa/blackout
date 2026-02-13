/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { StegoCodec, type DecodeOutcome } from "../../../src/steganography/StegoCodec";
import {
    StegoDecodeErrorCode,
    StegoStrategy,
    type StegoDecodeFailureTelemetryEvent,
} from "../../../src/steganography/types";

describe("StegoCodec hardening", () => {
    it("emits privacy-preserving decode failure telemetry", async () => {
        const telemetry: StegoDecodeFailureTelemetryEvent[] = [];
        const codec = new StegoCodec({
            decodeFailureReporter: (event) => telemetry.push(event),
        });

        const result = await codec.decodeDiagnostic("not stego");
        expect(result.ok).toBe(false);
        expect(telemetry).toHaveLength(1);

        const event = telemetry[0];
        expect(event.code).toBe(StegoDecodeErrorCode.NotStegoContent);
        expect(event.carrierType).toBe("unknown");
        expect(event.lengthBucket).toBe("1-32");
        expect(event.rsAttempted).toBe(false);
        expect(event.rsCorrected).toBe(false);
        expect(event.hasPartialHeader).toBe(false);
    });

    it("handles adversarial mutation corpus without throwing", async () => {
        const codec = new StegoCodec();
        const payload = new TextEncoder().encode("corpus baseline message");
        const message = await codec.encode(payload, { strategy: StegoStrategy.EmojiString });

        const corpus = [
            message.carrier.slice(0, Math.floor(message.carrier.length / 2)),
            message.carrier + "abc",
            message.carrier.replace(/\u200B/g, ""),
            message.carrier.split("").reverse().join(""),
            message.carrier.replace(/./, "X"),
            message.carrier + "🏴‍☠️",
            "\u200D\u200C\u200B",
            "",
        ];

        for (const sample of corpus) {
            const outcome = (await codec.decodeDiagnostic(sample)) as DecodeOutcome;
            const isValidOutcome = outcome.ok
                ? outcome.payload instanceof Uint8Array
                : outcome.error.code !== undefined;
            expect(isValidOutcome).toBe(true);
        }
    });

    it("survives fuzzed random string inputs", async () => {
        const codec = new StegoCodec();
        const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\u200B\u200C\u200D🐶🎩🌸🚩";

        const randomString = (seed: number): string => {
            let x = seed;
            const len = (seed % 220) + 1;
            let out = "";
            for (let i = 0; i < len; i++) {
                x = (x * 1664525 + 1013904223) >>> 0;
                out += chars[x % chars.length];
            }
            return out;
        };

        for (let i = 1; i <= 300; i++) {
            const candidate = randomString(i * 1337);
            await expect(codec.decodeDiagnostic(candidate)).resolves.toBeDefined();
        }
    });
});
