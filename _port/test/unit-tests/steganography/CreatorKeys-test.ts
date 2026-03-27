/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import {
    CreatorKeyLifecycleManager,
    PaidRoomAccessService,
    evaluateRevocationSla,
    resolvePaidRoomDiscoveryPolicy,
    type PaymentVerificationRequest,
    type PaymentVerificationResult,
    type PaymentVerificationService,
} from "../../../src/steganography/paidrooms/CreatorKeys";

class StubPaymentVerificationService implements PaymentVerificationService {
    public constructor(private readonly resolver: (request: PaymentVerificationRequest) => PaymentVerificationResult) {}

    public verifyPayment(request: PaymentVerificationRequest): PaymentVerificationResult {
        return this.resolver(request);
    }
}

describe("CreatorKeys", () => {
    it("defaults paid rooms to private discovery with no global index listing", () => {
        expect(resolvePaidRoomDiscoveryPolicy()).toEqual({
            visibility: "private",
            listedInGlobalDirectory: false,
        });

        expect(resolvePaidRoomDiscoveryPolicy({ visibility: "invite_only" })).toEqual({
            visibility: "invite_only",
            listedInGlobalDirectory: false,
        });
    });

    it("issues a grant after verified payment and bound device", () => {
        const lifecycle = new CreatorKeyLifecycleManager();
        const service = new PaidRoomAccessService(
            new StubPaymentVerificationService(() => ({ verified: true, paymentReference: "p-1", verifiedAt: 100 })),
            lifecycle,
        );

        const decision = service.verifyAndIssueGrant({
            payment: {
                accountId: "acct-1",
                creatorId: "creator-1",
                roomId: "!paid:server",
                receiptId: "r-1",
                paidAt: 50,
            },
            grant: {
                roomId: "!paid:server",
                creatorId: "creator-1",
                accountId: "acct-1",
                deviceId: "DEV1",
                encryptedRoomKey: "ciphertext-envelope",
                keyVersion: 1,
                now: 80,
            },
        });

        expect(decision.allowed).toBe(true);
        expect(decision.reason).toBe("ok");
        expect(decision.grant?.encryptedRoomKey).toBe("ciphertext-envelope");
    });

    it("rejects grant issuance when payment is not verified", () => {
        const lifecycle = new CreatorKeyLifecycleManager();
        const service = new PaidRoomAccessService(
            new StubPaymentVerificationService(() => ({ verified: false, paymentReference: "p-2", verifiedAt: 100 })),
            lifecycle,
        );

        const decision = service.verifyAndIssueGrant({
            payment: {
                accountId: "acct-2",
                creatorId: "creator-2",
                roomId: "!paid:server",
                receiptId: "r-2",
                paidAt: 80,
            },
            grant: {
                roomId: "!paid:server",
                creatorId: "creator-2",
                accountId: "acct-2",
                deviceId: "DEV2",
                encryptedRoomKey: "ciphertext-envelope",
                keyVersion: 1,
                now: 90,
            },
        });

        expect(decision).toEqual({
            allowed: false,
            reason: "payment_unverified",
        });
    });

    it("rotates and revokes old grants immediately", () => {
        const lifecycle = new CreatorKeyLifecycleManager();
        lifecycle.bindDevice("!paid:server", "DEV1");
        const grant = lifecycle.issueGrant({
            roomId: "!paid:server",
            creatorId: "creator",
            accountId: "acct",
            deviceId: "DEV1",
            encryptedRoomKey: "cipher-v1",
            keyVersion: 1,
            now: 10,
        });

        const nextVersion = lifecycle.rotateRoomKey("!paid:server", 100);

        expect(nextVersion).toBe(2);
        expect(lifecycle.evaluateGrant(grant, 100)).toEqual({
            allowed: false,
            reason: "grant_revoked",
        });

        const metrics = lifecycle.getLifecycleMetrics("!paid:server");
        expect(metrics.keyVersion).toBe(2);
        expect(metrics.rotatedAt).toBe(100);
        expect(metrics.revokedGrantCount).toBe(1);
    });

    it("reports revocation SLA attainment", () => {
        expect(evaluateRevocationSla({ suspectedAt: 1000, revokedAt: 1000 + 60_000, targetMs: 120_000 })).toEqual({
            met: true,
            targetMs: 120_000,
            elapsedMs: 60_000,
        });

        expect(evaluateRevocationSla({ suspectedAt: 1000, revokedAt: 1000 + 400_000, targetMs: 120_000 })).toEqual({
            met: false,
            targetMs: 120_000,
            elapsedMs: 400_000,
        });
    });
});
