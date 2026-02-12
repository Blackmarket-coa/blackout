/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { AttestationGraph } from "../../../src/services/attestations/attestationGraph";

describe("AttestationGraph", () => {
    it("stores active attestations and computes trust score breakdown", () => {
        const graph = new AttestationGraph();

        graph.addAttestation({
            id: "1",
            issuerUserId: "@mod:example.org",
            subjectUserId: "@alice:example.org",
            kind: "trust",
            topic: "budget",
            weight: 0.75,
            issuedAt: 100,
            signature: "sig-1",
        });

        graph.addAttestation({
            id: "2",
            issuerUserId: "@carol:example.org",
            subjectUserId: "@alice:example.org",
            kind: "trust",
            topic: "budget",
            weight: 0.25,
            issuedAt: 101,
            signature: "sig-2",
        });

        expect(graph.edgeCount(1000)).toBe(2);
        expect(graph.getTrustScore("@alice:example.org", "budget", 1000)).toMatchObject({
            score: 1,
            contributors: [
                { issuerUserId: "@mod:example.org", weight: 0.75, topic: "budget" },
                { issuerUserId: "@carol:example.org", weight: 0.25, topic: "budget" },
            ],
        });
    });

    it("returns credential status for active credential attestations", () => {
        const graph = new AttestationGraph();

        graph.addAttestation({
            id: "cred-1",
            issuerUserId: "@teacher:example.org",
            subjectUserId: "@alice:example.org",
            kind: "credential",
            topic: "first-aid",
            weight: 1,
            issuedAt: 200,
            signature: "sig-cred",
        });

        expect(graph.getCredentialStatus("@alice:example.org", "first-aid", 1000)).toEqual({
            hasCredential: true,
            supportingAttestationIds: ["cred-1"],
        });
    });

    it("rejects invalid attestations and expired entries", () => {
        const graph = new AttestationGraph();

        expect(() =>
            graph.addAttestation(
                {
                    id: "invalid",
                    issuerUserId: "@alice:example.org",
                    subjectUserId: "@alice:example.org",
                    kind: "trust",
                    weight: 1,
                    issuedAt: 500,
                    signature: "sig",
                },
                { now: 500 },
            ),
        ).toThrow("Self-attestation is not allowed");

        expect(() =>
            graph.addAttestation(
                {
                    id: "expired",
                    issuerUserId: "@mod:example.org",
                    subjectUserId: "@alice:example.org",
                    kind: "trust",
                    weight: 1,
                    issuedAt: 500,
                    expiresAt: 400,
                    signature: "sig",
                },
                { now: 500 },
            ),
        ).toThrow("Attestation is already expired");

        expect(() =>
            graph.addAttestation(
                {
                    id: "bad-signature",
                    issuerUserId: "@mod:example.org",
                    subjectUserId: "@alice:example.org",
                    kind: "trust",
                    weight: 1,
                    issuedAt: 500,
                    signature: "sig",
                },
                { verifySignature: () => false },
            ),
        ).toThrow("Attestation signature verification failed");
    });
});
