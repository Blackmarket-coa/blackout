/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

export type PaidRoomDiscoveryVisibility = "private" | "invite_only";

export interface PaidRoomDiscoveryPolicy {
    visibility: PaidRoomDiscoveryVisibility;
    listedInGlobalDirectory: boolean;
}

export function resolvePaidRoomDiscoveryPolicy(policy?: Partial<PaidRoomDiscoveryPolicy>): PaidRoomDiscoveryPolicy {
    return {
        visibility: policy?.visibility ?? "private",
        listedInGlobalDirectory: policy?.listedInGlobalDirectory ?? false,
    };
}

export interface PaymentVerificationRequest {
    accountId: string;
    creatorId: string;
    roomId: string;
    receiptId: string;
    paidAt: number;
}

export interface PaymentVerificationResult {
    verified: boolean;
    paymentReference: string;
    verifiedAt: number;
}

export interface PaymentVerificationService {
    verifyPayment(request: PaymentVerificationRequest): PaymentVerificationResult;
}

export interface CreatorKeyGrantInput {
    roomId: string;
    creatorId: string;
    accountId: string;
    deviceId: string;
    encryptedRoomKey: string;
    keyVersion: number;
    grantTtlMs?: number;
    now?: number;
}

export interface CreatorKeyGrant {
    grantId: string;
    roomId: string;
    accountId: string;
    deviceId: string;
    keyVersion: number;
    encryptedRoomKey: string;
    issuedAt: number;
    expiresAt: number;
    revokedAt?: number;
}

export interface PaymentGateDecision {
    allowed: boolean;
    reason: "ok" | "payment_unverified" | "device_not_bound" | "grant_revoked";
    grant?: CreatorKeyGrant;
}

export interface CreatorKeyLifecycleMetrics {
    keyVersion: number;
    rotatedAt?: number;
    revokedGrantCount: number;
}

interface RoomKeyState {
    currentKeyVersion: number;
    lastRotationAt?: number;
    grants: CreatorKeyGrant[];
    boundDevices: Set<string>;
}

/**
 * In-memory key lifecycle orchestrator for paid encrypted rooms.
 *
 * It intentionally stores only encrypted key envelopes and metadata needed for
 * grant/revoke accounting. There is no plaintext key handling API.
 */
export class CreatorKeyLifecycleManager {
    private readonly rooms = new Map<string, RoomKeyState>();

    public bindDevice(roomId: string, deviceId: string): void {
        this.getOrCreateRoom(roomId).boundDevices.add(deviceId);
    }

    public unbindDevice(roomId: string, deviceId: string): void {
        this.getOrCreateRoom(roomId).boundDevices.delete(deviceId);
    }

    public issueGrant(input: CreatorKeyGrantInput): CreatorKeyGrant {
        const now = input.now ?? Date.now();
        const room = this.getOrCreateRoom(input.roomId);
        const grant: CreatorKeyGrant = {
            grantId: `${input.roomId}:${input.deviceId}:${input.keyVersion}:${now}`,
            roomId: input.roomId,
            accountId: input.accountId,
            deviceId: input.deviceId,
            keyVersion: input.keyVersion,
            encryptedRoomKey: input.encryptedRoomKey,
            issuedAt: now,
            expiresAt: now + (input.grantTtlMs ?? 15 * 60 * 1000),
        };

        room.currentKeyVersion = Math.max(room.currentKeyVersion, input.keyVersion);
        room.grants.push(grant);
        return grant;
    }

    public rotateRoomKey(roomId: string, rotatedAt = Date.now()): number {
        const room = this.getOrCreateRoom(roomId);
        room.currentKeyVersion += 1;
        room.lastRotationAt = rotatedAt;

        for (const grant of room.grants) {
            if (!grant.revokedAt && grant.keyVersion < room.currentKeyVersion) {
                grant.revokedAt = rotatedAt;
            }
        }

        return room.currentKeyVersion;
    }

    public revokeGrant(grantId: string, revokedAt = Date.now()): boolean {
        for (const room of this.rooms.values()) {
            const grant = room.grants.find((candidate) => candidate.grantId === grantId);
            if (grant) {
                grant.revokedAt = revokedAt;
                return true;
            }
        }

        return false;
    }

    public evaluateGrant(grant: CreatorKeyGrant, now = Date.now()): PaymentGateDecision {
        const room = this.getOrCreateRoom(grant.roomId);
        if (!room.boundDevices.has(grant.deviceId)) {
            return { allowed: false, reason: "device_not_bound" };
        }

        if (grant.revokedAt || grant.keyVersion < room.currentKeyVersion || now > grant.expiresAt) {
            return { allowed: false, reason: "grant_revoked" };
        }

        return { allowed: true, reason: "ok", grant };
    }

    public getLifecycleMetrics(roomId: string): CreatorKeyLifecycleMetrics {
        const room = this.getOrCreateRoom(roomId);
        return {
            keyVersion: room.currentKeyVersion,
            rotatedAt: room.lastRotationAt,
            revokedGrantCount: room.grants.filter((grant) => grant.revokedAt).length,
        };
    }

    private getOrCreateRoom(roomId: string): RoomKeyState {
        let state = this.rooms.get(roomId);
        if (!state) {
            state = {
                currentKeyVersion: 1,
                grants: [],
                boundDevices: new Set(),
            };
            this.rooms.set(roomId, state);
        }
        return state;
    }
}

export class PaidRoomAccessService {
    public constructor(
        private readonly paymentVerificationService: PaymentVerificationService,
        private readonly lifecycleManager: CreatorKeyLifecycleManager,
    ) {}

    public verifyAndIssueGrant(input: {
        payment: PaymentVerificationRequest;
        grant: CreatorKeyGrantInput;
    }): PaymentGateDecision {
        const payment = this.paymentVerificationService.verifyPayment(input.payment);
        if (!payment.verified) {
            return { allowed: false, reason: "payment_unverified" };
        }

        this.lifecycleManager.bindDevice(input.grant.roomId, input.grant.deviceId);
        const grant = this.lifecycleManager.issueGrant(input.grant);
        return this.lifecycleManager.evaluateGrant(grant, payment.verifiedAt);
    }
}

export interface CreatorRevocationSlaResult {
    met: boolean;
    targetMs: number;
    elapsedMs: number;
}

export function evaluateRevocationSla(input: {
    suspectedAt: number;
    revokedAt: number;
    targetMs?: number;
}): CreatorRevocationSlaResult {
    const elapsedMs = Math.max(0, input.revokedAt - input.suspectedAt);
    const targetMs = input.targetMs ?? 5 * 60 * 1000;
    return {
        met: elapsedMs <= targetMs,
        targetMs,
        elapsedMs,
    };
}
