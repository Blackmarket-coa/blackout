/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import {
    GovernanceAttestationAuditLog,
    type GovernancePayloadEnvelope,
    verifyGovernancePayloadAttestation,
} from "../../../src/services/attestations/GovernancePayloadAttestation";

function makeEnvelope(overrides: Partial<GovernancePayloadEnvelope> = {}): GovernancePayloadEnvelope {
    return {
        version: 1,
        eventId: "$gov-1:example.org",
        roomId: "!gov:example.org",
        signerUserId: "@mod:example.org",
        signerKeyId: "ed25519:mod-main",
        issuedAt: 1000,
        expiresAt: 2000,
        signature: "sig-1",
        payloadHash: "sha256:abc123",
        ...overrides,
    };
}

describe("Governance payload attestation verification", () => {
    it("accepts valid envelopes with signer binding and deterministic verification", () => {
        const result = verifyGovernancePayloadAttestation(makeEnvelope(), {
            now: 1500,
            expectedSignerUserId: "@mod:example.org",
            verifySignature: (envelope) => envelope.signature === "sig-1",
        });

        expect(result).toEqual({ ok: true });
    });

    it("returns explicit deterministic rejection reasons", () => {
        expect(
            verifyGovernancePayloadAttestation(makeEnvelope({ version: 2 }), {
                now: 1500,
                verifySignature: () => true,
            }),
        ).toEqual({ ok: false, reason: "unsupported_version" });

        expect(
            verifyGovernancePayloadAttestation(makeEnvelope({ payloadHash: "" }), {
                now: 1500,
                verifySignature: () => true,
            }),
        ).toEqual({ ok: false, reason: "missing_field" });

        expect(
            verifyGovernancePayloadAttestation(makeEnvelope(), {
                now: 1500,
                expectedSignerUserId: "@other:example.org",
                verifySignature: () => true,
            }),
        ).toEqual({ ok: false, reason: "signer_binding_mismatch" });

        expect(
            verifyGovernancePayloadAttestation(makeEnvelope({ issuedAt: 3000 }), {
                now: 1500,
                verifySignature: () => true,
            }),
        ).toEqual({ ok: false, reason: "issued_at_in_future" });

        expect(
            verifyGovernancePayloadAttestation(makeEnvelope({ expiresAt: 1499 }), {
                now: 1500,
                verifySignature: () => true,
            }),
        ).toEqual({ ok: false, reason: "expired" });

        expect(
            verifyGovernancePayloadAttestation(makeEnvelope(), {
                now: 1500,
                verifySignature: () => false,
            }),
        ).toEqual({ ok: false, reason: "signature_verification_failed" });
    });

    it("builds governance event audit summary logs for operators", () => {
        const auditLog = new GovernanceAttestationAuditLog();

        auditLog.record({ ok: true });
        auditLog.record({ ok: false, reason: "signature_verification_failed" });
        auditLog.record({ ok: false, reason: "signer_binding_mismatch" });

        expect(auditLog.getSummary()).toEqual({
            accepted: 1,
            rejected: 2,
            rejectionReasons: {
                unsupported_version: 0,
                missing_field: 0,
                signer_binding_mismatch: 1,
                issued_at_in_future: 0,
                expired: 0,
                signature_verification_failed: 1,
            },
        });
    });
});
