/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

export type GovernanceLifecycleState = "draft" | "discuss" | "amend" | "close" | "decide";

export interface ProposalDocument {
    id: string;
    roomId: string;
    title: string;
    body: string;
    authorUserId: string;
    state: GovernanceLifecycleState;
    createdAt: number;
    updatedAt: number;
}

export interface VoteDocument {
    proposalId: string;
    roomId: string;
    votesByUserId: Record<string, "approve" | "reject" | "abstain">;
    openedAt: number;
    closedAt?: number;
}

export interface DelegationDocument {
    topic: string;
    delegationsByUserId: Record<string, string>;
    updatedAt: number;
}
