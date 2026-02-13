/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import type { VoteDocument } from "../../modules/governance/models/types";

export type Ballot = VoteDocument["votesByUserId"][string];

export interface VoteTally {
    approve: number;
    reject: number;
    abstain: number;
    passed: boolean;
    totalVotes: number;
    quorumMet: boolean;
    policy: VotingPolicy;
}

export interface VotingPolicy {
    quorum?: number;
    threshold?: {
        type: "simple_majority" | "supermajority";
        ratio?: number;
    };
}

const DEFAULT_VOTING_POLICY: Required<VotingPolicy> = {
    quorum: 0,
    threshold: {
        type: "simple_majority",
        ratio: 0.5,
    },
};

function normalizePolicy(policy?: VotingPolicy): Required<VotingPolicy> {
    const quorum = Math.max(0, Math.floor(policy?.quorum ?? DEFAULT_VOTING_POLICY.quorum));
    const thresholdType = policy?.threshold?.type ?? DEFAULT_VOTING_POLICY.threshold.type;
    const ratio = policy?.threshold?.ratio ?? DEFAULT_VOTING_POLICY.threshold.ratio;

    return {
        quorum,
        threshold: {
            type: thresholdType,
            ratio: Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) : DEFAULT_VOTING_POLICY.threshold.ratio,
        },
    };
}

export class VotingEngine {
    public open(proposalId: string, roomId: string, now: number = Date.now()): VoteDocument {
        return {
            schemaVersion: 1,
            proposalId,
            roomId,
            votesByUserId: {},
            openedAt: now,
        };
    }

    public cast(vote: VoteDocument, userId: string, ballot: Ballot): VoteDocument {
        if (vote.closedAt) {
            throw new Error("Voting is already closed");
        }

        return {
            ...vote,
            votesByUserId: {
                ...vote.votesByUserId,
                [userId]: ballot,
            },
        };
    }

    public close(vote: VoteDocument, now: number = Date.now()): VoteDocument {
        if (vote.closedAt) {
            return vote;
        }

        return {
            ...vote,
            closedAt: now,
        };
    }

    public tally(vote: VoteDocument, policy?: VotingPolicy): VoteTally {
        const effectivePolicy = normalizePolicy(policy);
        const summary: VoteTally = {
            approve: 0,
            reject: 0,
            abstain: 0,
            passed: false,
            totalVotes: 0,
            quorumMet: false,
            policy: effectivePolicy,
        };

        for (const ballot of Object.values(vote.votesByUserId)) {
            summary[ballot] += 1;
            summary.totalVotes += 1;
        }

        summary.quorumMet = summary.totalVotes >= effectivePolicy.quorum;
        if (!summary.quorumMet) {
            return summary;
        }

        if (effectivePolicy.threshold.type === "supermajority") {
            const consideredVotes = summary.approve + summary.reject;
            if (consideredVotes === 0) {
                summary.passed = false;
                return summary;
            }

            summary.passed = summary.approve / consideredVotes >= effectivePolicy.threshold.ratio;
            return summary;
        }

        summary.passed = summary.approve > summary.reject;
        return summary;
    }
}
