/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import type { EntitlementTier, EntitlementToken } from "./EntitlementManager";

export interface BillingAccountState {
    accountId: string;
    subscriptionActive: boolean;
    tier: EntitlementTier;
    periodEndsAt: number;
}

export interface BillingService {
    getAccountState(accountId: string): BillingAccountState;
}

export interface EntitlementTokenClaims {
    accountId: string;
    userId: string;
    deviceId: string;
    tier: EntitlementTier;
    issuedAt: number;
    expiresAt: number;
}

export class EntitlementTokenService {
    public issueToken(claims: EntitlementTokenClaims): EntitlementToken {
        return {
            subject: claims.userId,
            deviceId: claims.deviceId,
            tier: claims.tier,
            issuedAt: claims.issuedAt,
            expiresAt: claims.expiresAt,
        };
    }

    public issueFromBilling(
        billingService: BillingService,
        input: { accountId: string; userId: string; deviceId: string; now?: number },
    ): EntitlementToken {
        const now = input.now ?? Date.now();
        const accountState = billingService.getAccountState(input.accountId);

        if (!accountState.subscriptionActive) {
            return this.issueToken({
                accountId: input.accountId,
                userId: input.userId,
                deviceId: input.deviceId,
                tier: "free",
                issuedAt: now,
                expiresAt: now + 60 * 60 * 1000,
            });
        }

        const expiresAt = Math.min(accountState.periodEndsAt, now + 30 * 24 * 60 * 60 * 1000);

        return this.issueToken({
            accountId: input.accountId,
            userId: input.userId,
            deviceId: input.deviceId,
            tier: accountState.tier,
            issuedAt: now,
            expiresAt,
        });
    }
}

export type EntitlementAuditResult = "allow" | "deny";
export type EntitlementAuditReason =
    | "ok"
    | "token_inactive"
    | "payload_too_large"
    | "expiry_too_long"
    | "too_many_devices";

export interface EntitlementAuditRecord {
    timestamp: number;
    accountId: string;
    tokenTier: EntitlementTier;
    result: EntitlementAuditResult;
    reason: EntitlementAuditReason;
    payloadSizeBucket: "0" | "1-256" | "257-1024" | "1025-4096" | "4097+";
    requestedExpiryBucket: "0" | "1-1h" | "1h-24h" | "24h-72h" | "72h+";
    linkedDeviceCountBucket: "0" | "1-4" | "5-10" | "11-20" | "21+";
}

export function bucketPayloadSize(size: number): EntitlementAuditRecord["payloadSizeBucket"] {
    if (size <= 0) return "0";
    if (size <= 256) return "1-256";
    if (size <= 1024) return "257-1024";
    if (size <= 4096) return "1025-4096";
    return "4097+";
}

export function bucketRequestedExpiry(expiryMs: number): EntitlementAuditRecord["requestedExpiryBucket"] {
    if (expiryMs <= 0) return "0";
    if (expiryMs <= 60 * 60 * 1000) return "1-1h";
    if (expiryMs <= 24 * 60 * 60 * 1000) return "1h-24h";
    if (expiryMs <= 72 * 60 * 60 * 1000) return "24h-72h";
    return "72h+";
}

export function bucketDeviceCount(count: number): EntitlementAuditRecord["linkedDeviceCountBucket"] {
    if (count <= 0) return "0";
    if (count <= 4) return "1-4";
    if (count <= 10) return "5-10";
    if (count <= 20) return "11-20";
    return "21+";
}

export class EntitlementAuditLogger {
    private readonly records: EntitlementAuditRecord[] = [];

    public record(entry: EntitlementAuditRecord): void {
        this.records.push(entry);
    }

    public readAll(): readonly EntitlementAuditRecord[] {
        return this.records;
    }
}

export interface ServerSafetyRequest {
    accountId: string;
    eventsPerMinute: number;
    bytesPerMinute: number;
}

export interface ServerSafetyDecision {
    allowed: boolean;
    reason: "ok" | "rate_limit_exceeded" | "bandwidth_limit_exceeded";
}

export class ServerSafetyInvariantEnforcer {
    public constructor(
        private readonly caps: {
            maxEventsPerMinute: number;
            maxBytesPerMinute: number;
        } = {
            maxEventsPerMinute: 120,
            maxBytesPerMinute: 256_000,
        },
    ) {}

    public evaluate(request: ServerSafetyRequest): ServerSafetyDecision {
        if (request.eventsPerMinute > this.caps.maxEventsPerMinute) {
            return { allowed: false, reason: "rate_limit_exceeded" };
        }

        if (request.bytesPerMinute > this.caps.maxBytesPerMinute) {
            return { allowed: false, reason: "bandwidth_limit_exceeded" };
        }

        return { allowed: true, reason: "ok" };
    }
}
