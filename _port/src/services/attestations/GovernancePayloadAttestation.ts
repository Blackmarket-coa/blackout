/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

export interface GovernancePayloadEnvelope {
    version: number;
    eventId: string;
    roomId: string;
    signerUserId: string;
    signerKeyId: string;
    issuedAt: number;
    expiresAt?: number;
    signature: string;
    payloadHash: string;
}

export type GovernanceAttestationRejectionReason =
    | "unsupported_version"
    | "missing_field"
    | "signer_binding_mismatch"
    | "issued_at_in_future"
    | "expired"
    | "signature_verification_failed";

export interface GovernanceAttestationVerificationResult {
    ok: boolean;
    reason?: GovernanceAttestationRejectionReason;
}

export interface GovernanceAttestationAuditSummary {
    accepted: number;
    rejected: number;
    rejectionReasons: Record<GovernanceAttestationRejectionReason, number>;
}

export interface VerifyGovernancePayloadOptions {
    now?: number;
    expectedSignerUserId?: string;
    verifySignature: (envelope: GovernancePayloadEnvelope) => boolean;
}

export class GovernanceAttestationAuditLog {
    private accepted = 0;
    private rejected = 0;
    private readonly rejectionReasons: GovernanceAttestationAuditSummary["rejectionReasons"] = {
        unsupported_version: 0,
        missing_field: 0,
        signer_binding_mismatch: 0,
        issued_at_in_future: 0,
        expired: 0,
        signature_verification_failed: 0,
    };

    public record(result: GovernanceAttestationVerificationResult): void {
        if (result.ok) {
            this.accepted += 1;
            return;
        }

        this.rejected += 1;
        if (result.reason) {
            this.rejectionReasons[result.reason] += 1;
        }
    }

    public getSummary(): GovernanceAttestationAuditSummary {
        return {
            accepted: this.accepted,
            rejected: this.rejected,
            rejectionReasons: { ...this.rejectionReasons },
        };
    }
}

export function verifyGovernancePayloadAttestation(
    envelope: GovernancePayloadEnvelope,
    options: VerifyGovernancePayloadOptions,
): GovernanceAttestationVerificationResult {
    if (envelope.version !== 1) {
        return { ok: false, reason: "unsupported_version" };
    }

    if (
        !envelope.eventId ||
        !envelope.roomId ||
        !envelope.signerUserId ||
        !envelope.signerKeyId ||
        !envelope.signature ||
        !envelope.payloadHash
    ) {
        return { ok: false, reason: "missing_field" };
    }

    if (options.expectedSignerUserId && options.expectedSignerUserId !== envelope.signerUserId) {
        return { ok: false, reason: "signer_binding_mismatch" };
    }

    const now = options.now ?? Date.now();
    if (envelope.issuedAt > now) {
        return { ok: false, reason: "issued_at_in_future" };
    }

    if (envelope.expiresAt && envelope.expiresAt <= now) {
        return { ok: false, reason: "expired" };
    }

    if (!options.verifySignature(envelope)) {
        return { ok: false, reason: "signature_verification_failed" };
    }

    return { ok: true };
}
