/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { encodeEmoji } from "../../../src/steganography/EmojiStego";
import { validateCarrierCompatibility } from "../../../src/steganography/CarrierCompatibility";
import { StegoStrategy } from "../../../src/steganography/types";

describe("CarrierCompatibility", () => {
    it("accepts a valid emoji carrier", () => {
        const payload = new TextEncoder().encode("phase 2 compatibility");
        const carrier = encodeEmoji(payload, Date.now() + 5000, StegoStrategy.EmojiString);

        const report = validateCarrierCompatibility(carrier);
        expect(report.compatible).toBe(true);
        expect(report.emojiCount).toBeGreaterThan(0);
    });

    it("rejects carriers with unsupported characters", () => {
        const report = validateCarrierCompatibility("mxstego:v1:1/1:🐶X");
        expect(report.compatible).toBe(false);
        expect(report.issues).toContain("Carrier contains characters outside the supported emoji set");
    });
});
