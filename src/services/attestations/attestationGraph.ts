/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

export type AttestationKind = "trust" | "credential";

export interface AttestationEdge {
    id: string;
    issuerUserId: string;
    subjectUserId: string;
    kind: AttestationKind;
    topic?: string;
    weight: number;
    issuedAt: number;
    expiresAt?: number;
    signature: string;
}

export interface TrustScoreBreakdown {
    score: number;
    contributors: Array<{
        issuerUserId: string;
        weight: number;
        topic?: string;
    }>;
}

export interface CredentialStatus {
    hasCredential: boolean;
    supportingAttestationIds: string[];
}

interface AddAttestationOptions {
    now?: number;
    verifySignature?: (attestation: AttestationEdge) => boolean;
}

export class AttestationGraph {
    private readonly edgesById = new Map<string, AttestationEdge>();

    public addAttestation(attestation: AttestationEdge, options: AddAttestationOptions = {}): void {
        this.validateAttestation(attestation, options.now);

        if (options.verifySignature && !options.verifySignature(attestation)) {
            throw new Error("Attestation signature verification failed");
        }

        this.edgesById.set(attestation.id, attestation);
    }

    public removeAttestation(attestationId: string): void {
        this.edgesById.delete(attestationId);
    }

    public edgeCount(now: number = Date.now()): number {
        return this.getActiveEdges(now).length;
    }

    public getTrustScore(subjectUserId: string, topic?: string, now: number = Date.now()): TrustScoreBreakdown {
        const contributors = this.getActiveEdges(now)
            .filter((edge) => edge.kind === "trust")
            .filter((edge) => edge.subjectUserId === subjectUserId)
            .filter((edge) => (topic ? edge.topic === topic : true))
            .map((edge) => ({
                issuerUserId: edge.issuerUserId,
                weight: edge.weight,
                topic: edge.topic,
            }));

        const score = contributors.reduce((sum, contributor) => sum + contributor.weight, 0);

        return {
            score,
            contributors,
        };
    }

    public getCredentialStatus(subjectUserId: string, topic?: string, now: number = Date.now()): CredentialStatus {
        const supportingAttestationIds = this.getActiveEdges(now)
            .filter((edge) => edge.kind === "credential")
            .filter((edge) => edge.subjectUserId === subjectUserId)
            .filter((edge) => (topic ? edge.topic === topic : true))
            .map((edge) => edge.id);

        return {
            hasCredential: supportingAttestationIds.length > 0,
            supportingAttestationIds,
        };
    }

    public listForSubject(subjectUserId: string, now: number = Date.now()): AttestationEdge[] {
        return this.getActiveEdges(now).filter((edge) => edge.subjectUserId === subjectUserId);
    }

    private getActiveEdges(now: number): AttestationEdge[] {
        return [...this.edgesById.values()].filter((edge) => !edge.expiresAt || edge.expiresAt > now);
    }

    private validateAttestation(attestation: AttestationEdge, now: number = Date.now()): void {
        if (!attestation.id) {
            throw new Error("Attestation id is required");
        }

        if (attestation.issuerUserId === attestation.subjectUserId) {
            throw new Error("Self-attestation is not allowed");
        }

        if (attestation.weight < 0 || attestation.weight > 1) {
            throw new Error("Attestation weight must be between 0 and 1");
        }

        if (!attestation.signature) {
            throw new Error("Attestation signature is required");
        }

        if (attestation.expiresAt && attestation.expiresAt <= now) {
            throw new Error("Attestation is already expired");
        }
    }
}
