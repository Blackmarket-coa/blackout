/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { EntitlementManager, type EntitlementToken } from "../../../src/steganography/entitlements/EntitlementManager";

describe("EntitlementManager", () => {
    const manager = new EntitlementManager();
    const baseToken: EntitlementToken = {
        subject: "@alice:example.org",
        deviceId: "DEVICE",
        tier: "free",
        issuedAt: 1_700_000_000_000,
        expiresAt: 1_800_000_000_000,
    };

    it("resolves tier limits without content context", () => {
        expect(manager.getLimits({ ...baseToken, tier: "free" }).maxPayloadBytes).toBe(1024);
        expect(manager.getLimits({ ...baseToken, tier: "plus" }).maxPayloadBytes).toBe(2048);
        expect(manager.getLimits({ ...baseToken, tier: "pro" }).maxPayloadBytes).toBe(4096);
    });

    it("validates token active window", () => {
        expect(manager.isTokenActive(baseToken, 1_750_000_000_000)).toBe(true);
        expect(manager.isTokenActive(baseToken, 1_800_000_000_000)).toBe(false);
    });

    it("enforces send limits via content-blind inputs", () => {
        const token = { ...baseToken, tier: "plus" as const };
        expect(
            manager.canSend(token, { payloadSizeBytes: 1900, requestedExpiryMs: 60_000, linkedDeviceCount: 3 }),
        ).toEqual({ allowed: true });

        expect(
            manager.canSend(token, { payloadSizeBytes: 3000, requestedExpiryMs: 60_000, linkedDeviceCount: 3 }),
        ).toEqual({ allowed: false, reason: "payload_too_large" });

        expect(
            manager.canSend(token, {
                payloadSizeBytes: 1900,
                requestedExpiryMs: 73 * 60 * 60 * 1000,
                linkedDeviceCount: 3,
            }),
        ).toEqual({ allowed: false, reason: "expiry_too_long" });

        expect(
            manager.canSend(token, { payloadSizeBytes: 1900, requestedExpiryMs: 60_000, linkedDeviceCount: 11 }),
        ).toEqual({ allowed: false, reason: "too_many_devices" });
    });
});
