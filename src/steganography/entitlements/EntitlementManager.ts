/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { DEFAULT_STEGO_CONFIG } from "../types";
import {
    bucketDeviceCount,
    bucketPayloadSize,
    bucketRequestedExpiry,
    type EntitlementAuditLogger,
    type EntitlementAuditReason,
} from "./EntitlementInfrastructure";

export type EntitlementTier = "free" | "plus" | "pro";

export interface EntitlementToken {
    subject: string;
    deviceId: string;
    tier: EntitlementTier;
    issuedAt: number;
    expiresAt: number;
}

export interface EntitlementLimits {
    maxPayloadBytes: number;
    maxExpiryMs: number;
    maxLinkedDevices: number;
}

export class EntitlementManager {
    public getLimits(token: EntitlementToken): EntitlementLimits {
        switch (token.tier) {
            case "pro":
                return {
                    maxPayloadBytes: 4096,
                    maxExpiryMs: 7 * 24 * 60 * 60 * 1000,
                    maxLinkedDevices: 20,
                };
            case "plus":
                return {
                    maxPayloadBytes: 2048,
                    maxExpiryMs: 72 * 60 * 60 * 1000,
                    maxLinkedDevices: 10,
                };
            case "free":
            default:
                return {
                    maxPayloadBytes: DEFAULT_STEGO_CONFIG.maxEmojiPayloadBytes,
                    maxExpiryMs: DEFAULT_STEGO_CONFIG.defaultExpiryMs,
                    maxLinkedDevices: 4,
                };
        }
    }

    public isTokenActive(token: EntitlementToken, now = Date.now()): boolean {
        return token.issuedAt <= now && now < token.expiresAt;
    }

    public canSend(
        token: EntitlementToken,
        request: { payloadSizeBytes: number; requestedExpiryMs: number; linkedDeviceCount: number },
    ): { allowed: true } | { allowed: false; reason: "payload_too_large" | "expiry_too_long" | "too_many_devices" } {
        const limits = this.getLimits(token);

        if (request.payloadSizeBytes > limits.maxPayloadBytes) {
            return { allowed: false, reason: "payload_too_large" };
        }

        if (request.requestedExpiryMs > limits.maxExpiryMs) {
            return { allowed: false, reason: "expiry_too_long" };
        }

        if (request.linkedDeviceCount > limits.maxLinkedDevices) {
            return { allowed: false, reason: "too_many_devices" };
        }

        return { allowed: true };
    }

    public evaluateAndAudit(
        logger: EntitlementAuditLogger,
        input: {
            accountId: string;
            token: EntitlementToken;
            request: { payloadSizeBytes: number; requestedExpiryMs: number; linkedDeviceCount: number };
            now?: number;
        },
    ): { allowed: true } | { allowed: false; reason: EntitlementAuditReason } {
        const now = input.now ?? Date.now();

        if (!this.isTokenActive(input.token, now)) {
            logger.record({
                timestamp: now,
                accountId: input.accountId,
                tokenTier: input.token.tier,
                result: "deny",
                reason: "token_inactive",
                payloadSizeBucket: bucketPayloadSize(input.request.payloadSizeBytes),
                requestedExpiryBucket: bucketRequestedExpiry(input.request.requestedExpiryMs),
                linkedDeviceCountBucket: bucketDeviceCount(input.request.linkedDeviceCount),
            });
            return { allowed: false, reason: "token_inactive" };
        }

        const decision = this.canSend(input.token, input.request);
        if (decision.allowed) {
            logger.record({
                timestamp: now,
                accountId: input.accountId,
                tokenTier: input.token.tier,
                result: "allow",
                reason: "ok",
                payloadSizeBucket: bucketPayloadSize(input.request.payloadSizeBytes),
                requestedExpiryBucket: bucketRequestedExpiry(input.request.requestedExpiryMs),
                linkedDeviceCountBucket: bucketDeviceCount(input.request.linkedDeviceCount),
            });
            return decision;
        }

        logger.record({
            timestamp: now,
            accountId: input.accountId,
            tokenTier: input.token.tier,
            result: "deny",
            reason: decision.reason,
            payloadSizeBucket: bucketPayloadSize(input.request.payloadSizeBytes),
            requestedExpiryBucket: bucketRequestedExpiry(input.request.requestedExpiryMs),
            linkedDeviceCountBucket: bucketDeviceCount(input.request.linkedDeviceCount),
        });
        return { allowed: false, reason: decision.reason };
    }
}
