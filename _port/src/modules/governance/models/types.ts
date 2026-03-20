/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

export type GovernanceLifecycleState = "draft" | "discuss" | "amend" | "close" | "decide";

export interface GovernanceAuditEntry {
    id: string;
    actorUserId: string;
    action: "create" | "transition" | "amend" | "vote_open" | "vote_close" | "jury_select";
    at: number;
    detail?: string;
}

export interface ProposalAmendment {
    id: string;
    actorUserId: string;
    previousBody: string;
    nextBody: string;
    createdAt: number;
}

export interface ProposalDocument {
    schemaVersion: number;
    id: string;
    roomId: string;
    title: string;
    body: string;
    authorUserId: string;
    cadence: {
        digestMode: "daily" | "twice_daily" | "manual";
        decisionWindowHours: number;
        engagementLoopProtection: true;
    };
    jurySelection?: JurySelectionRecord;
    state: GovernanceLifecycleState;
    amendments: ProposalAmendment[];
    auditTimeline: GovernanceAuditEntry[];
    createdAt: number;
    updatedAt: number;
}

export interface JurySelectionRecord {
    selectedJurorIds: string[];
    eligibleCount: number;
    policy: {
        jurySize: number;
        minPowerLevel?: number;
        excludedUserIds?: string[];
        requireActive?: boolean;
    };
    proof: {
        algorithm: string;
        seedMaterial: string;
        seedHash: string;
        drawHashes: string[];
    };
}

export interface VoteDocument {
    schemaVersion: number;
    proposalId: string;
    roomId: string;
    votesByUserId: Record<string, "approve" | "reject" | "abstain">;
    openedAt: number;
    closedAt?: number;
}

export interface DelegationDocument {
    schemaVersion: number;
    topic: string;
    delegationsByUserId: Record<string, string>;
    updatedAt: number;
}
