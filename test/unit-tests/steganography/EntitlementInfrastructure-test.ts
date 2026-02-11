/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { EntitlementManager } from "../../../src/steganography/entitlements/EntitlementManager";
import {
    bucketDeviceCount,
    bucketPayloadSize,
    bucketRequestedExpiry,
    EntitlementAuditLogger,
    EntitlementTokenService,
    ServerSafetyInvariantEnforcer,
    type BillingService,
} from "../../../src/steganography/entitlements/EntitlementInfrastructure";

describe("EntitlementInfrastructure", () => {
    it("issues fallback free tokens during billing outage/degraded state", () => {
        const tokenService = new EntitlementTokenService();
        const billingService: BillingService = {
            getAccountState(accountId: string) {
                return {
                    accountId,
                    subscriptionActive: false,
                    tier: "pro",
                    periodEndsAt: 1_900_000_000_000,
                };
            },
        };

        const token = tokenService.issueFromBilling(billingService, {
            accountId: "acct-1",
            userId: "@alice:example.org",
            deviceId: "DEV1",
            now: 1_800_000_000_000,
        });

        expect(token.tier).toBe("free");
        expect(token.expiresAt).toBe(1_800_000_000_000 + 60 * 60 * 1000);
    });

    it("records content-blind audit logs with bucketed metadata only", () => {
        const manager = new EntitlementManager();
        const logger = new EntitlementAuditLogger();
        const token = {
            subject: "@alice:example.org",
            deviceId: "DEV1",
            tier: "plus" as const,
            issuedAt: 10,
            expiresAt: 20,
        };

        const decision = manager.evaluateAndAudit(logger, {
            accountId: "acct-1",
            token,
            request: {
                payloadSizeBytes: 2_900,
                requestedExpiryMs: 80 * 60 * 60 * 1000,
                linkedDeviceCount: 12,
            },
            now: 15,
        });

        expect(decision).toEqual({ allowed: false, reason: "payload_too_large" });
        const record = logger.readAll()[0];
        expect(record).toMatchObject({
            accountId: "acct-1",
            result: "deny",
            reason: "payload_too_large",
            payloadSizeBucket: "1025-4096",
            requestedExpiryBucket: "72h+",
            linkedDeviceCountBucket: "11-20",
        });
        expect(Object.keys(record).sort()).toEqual(
            [
                "accountId",
                "linkedDeviceCountBucket",
                "payloadSizeBucket",
                "reason",
                "requestedExpiryBucket",
                "result",
                "timestamp",
                "tokenTier",
            ].sort(),
        );
    });

    it("enforces server-side safety invariants using protocol-level rates only", () => {
        const enforcer = new ServerSafetyInvariantEnforcer({ maxEventsPerMinute: 100, maxBytesPerMinute: 50_000 });

        expect(enforcer.evaluate({ accountId: "acct-1", eventsPerMinute: 50, bytesPerMinute: 40_000 })).toEqual({
            allowed: true,
            reason: "ok",
        });

        expect(enforcer.evaluate({ accountId: "acct-1", eventsPerMinute: 101, bytesPerMinute: 40_000 })).toEqual({
            allowed: false,
            reason: "rate_limit_exceeded",
        });

        expect(enforcer.evaluate({ accountId: "acct-1", eventsPerMinute: 80, bytesPerMinute: 50_001 })).toEqual({
            allowed: false,
            reason: "bandwidth_limit_exceeded",
        });
    });

    it("buckets measurements deterministically", () => {
        expect(bucketPayloadSize(0)).toBe("0");
        expect(bucketPayloadSize(800)).toBe("257-1024");
        expect(bucketRequestedExpiry(10 * 60 * 60 * 1000)).toBe("1h-24h");
        expect(bucketDeviceCount(25)).toBe("21+");
    });
});
