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
    policy: NormalizedVotingPolicy;
}

interface NormalizedVotingPolicy {
    quorum: number;
    threshold: {
        type: "simple_majority" | "supermajority";
        ratio: number;
    };
}

export interface VotingPolicyTuning {
    defaults?: VotingPolicy;
    bounds?: {
        quorum?: {
            min?: number;
            max?: number;
        };
        supermajorityRatio?: {
            min?: number;
            max?: number;
        };
    };
}

export interface VotingPolicy {
    quorum?: number;
    threshold?: {
        type: "simple_majority" | "supermajority";
        ratio?: number;
    };
}

const DEFAULT_VOTING_POLICY: NormalizedVotingPolicy = {
    quorum: 1,
    threshold: {
        type: "simple_majority",
        ratio: 0.5,
    },
};

const DEFAULT_POLICY_TUNING = {
    defaults: {
        quorum: DEFAULT_VOTING_POLICY.quorum,
        threshold: {
            type: DEFAULT_VOTING_POLICY.threshold.type,
            ratio: DEFAULT_VOTING_POLICY.threshold.ratio,
        },
    },
    bounds: {
        quorum: {
            min: 1,
            max: 10_000,
        },
        supermajorityRatio: {
            min: 0.55,
            max: 0.9,
        },
    },
};

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function normalizePolicy(policy: VotingPolicy | undefined, tuning: VotingPolicyTuning): NormalizedVotingPolicy {
    const quorumMin = tuning.bounds?.quorum?.min ?? DEFAULT_POLICY_TUNING.bounds.quorum.min;
    const quorumMax = tuning.bounds?.quorum?.max ?? DEFAULT_POLICY_TUNING.bounds.quorum.max;
    const defaultQuorum = tuning.defaults?.quorum ?? DEFAULT_POLICY_TUNING.defaults.quorum;

    const quorumRaw = policy?.quorum ?? defaultQuorum;
    const quorum = clamp(Math.floor(Number.isFinite(quorumRaw) ? quorumRaw : defaultQuorum), quorumMin, quorumMax);

    const thresholdType = policy?.threshold?.type ?? tuning.defaults?.threshold?.type ?? DEFAULT_VOTING_POLICY.threshold.type;
    const ratioRaw = policy?.threshold?.ratio;
    const ratio =
        typeof ratioRaw === "number"
            ? ratioRaw
            : tuning.defaults?.threshold?.ratio ?? DEFAULT_POLICY_TUNING.defaults.threshold.ratio;

    const ratioMin = tuning.bounds?.supermajorityRatio?.min ?? DEFAULT_POLICY_TUNING.bounds.supermajorityRatio.min;
    const ratioMax = tuning.bounds?.supermajorityRatio?.max ?? DEFAULT_POLICY_TUNING.bounds.supermajorityRatio.max;
    const normalizedSupermajorityRatio =
        typeof ratio === "number" && Number.isFinite(ratio)
            ? clamp(ratio, ratioMin, ratioMax)
            : DEFAULT_POLICY_TUNING.defaults.threshold.ratio;

    return {
        quorum,
        threshold: {
            type: thresholdType,
            ratio: thresholdType === "supermajority" ? normalizedSupermajorityRatio : 0.5,
        },
    };
}

export class VotingEngine {
    public constructor(private readonly tuning: VotingPolicyTuning = DEFAULT_POLICY_TUNING) {}

    public getPolicyTuning(): VotingPolicyTuning {
        return this.tuning;
    }

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
        const effectivePolicy = normalizePolicy(policy, this.tuning);
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

            const thresholdRatio = effectivePolicy.threshold.ratio;
            summary.passed = summary.approve / consideredVotes >= thresholdRatio;
            return summary;
        }

        summary.passed = summary.approve > summary.reject;
        return summary;
    }
}
