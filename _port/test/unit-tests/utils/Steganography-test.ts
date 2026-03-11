/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import nodeCrypto from "crypto";

import {
    encodeSteganographyMessage,
    decodeSteganographyMessage,
    containsSteganographyMessage,
    stripSteganographyContent,
} from "../../../src/utils/Steganography";

describe("Steganography utils", () => {
    const originalCrypto = globalThis.crypto;
    const testCrypto = nodeCrypto.webcrypto as unknown as Crypto;

    beforeEach(() => {
        const cryptoImpl = originalCrypto ?? testCrypto;
        Object.defineProperty(globalThis, "crypto", {
            value: cryptoImpl,
            configurable: true,
        });
        Object.defineProperty(window, "crypto", {
            value: cryptoImpl,
            configurable: true,
        });
    });

    afterAll(() => {
        Object.defineProperty(globalThis, "crypto", {
            value: originalCrypto,
            configurable: true,
        });
        Object.defineProperty(window, "crypto", {
            value: originalCrypto,
            configurable: true,
        });
    });

    it("encodes and decodes plaintext hidden messages", async () => {
        const encoded = await encodeSteganographyMessage("hi", "hello");

        expect(containsSteganographyMessage(encoded)).toBe(true);
        await expect(decodeSteganographyMessage(encoded)).resolves.toBe("hello");
        expect(stripSteganographyContent(encoded)).toBe("hi");
    });

    it("throws a clear error if Web Crypto is unavailable", async () => {
        Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });

        await expect(encodeSteganographyMessage("hi", "hello", "secret")).rejects.toThrow(
            "Web Crypto API is not available",
        );
    });
});
