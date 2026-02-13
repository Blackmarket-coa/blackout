/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import type { VoteDocument } from "../../modules/governance/models/types";
import type { DelegationResolution, DelegationGraph } from "../delegation/DelegationGraph";
import { type Ballot, type VoteTally, type VotingPolicy, VotingEngine } from "./VotingEngine";

export interface DelegatedVoteAttribution {
    voterUserId: string;
    ballot: Ballot;
    representedUserIds: string[];
}

export interface DelegatedVoteTally extends VoteTally {
    attributions: DelegatedVoteAttribution[];
    resolutionsByUserId: Record<string, DelegationResolution>;
}

export class DelegatedVotingEngine {
    public tally(
        vote: VoteDocument,
        topic: string,
        participantUserIds: string[],
        delegationGraph: DelegationGraph,
        policy?: VotingPolicy,
    ): DelegatedVoteTally {
        const directVoterIds = new Set(Object.keys(vote.votesByUserId));
        const representedByVoter = new Map<string, string[]>();
        const resolutionsByUserId: Record<string, DelegationResolution> = {};

        for (const participantUserId of participantUserIds) {
            const resolution = delegationGraph.resolve(topic, participantUserId, directVoterIds);
            resolutionsByUserId[participantUserId] = resolution;

            if (!directVoterIds.has(resolution.effectiveVoter)) {
                continue;
            }

            const represented = representedByVoter.get(resolution.effectiveVoter) ?? [];
            represented.push(participantUserId);
            representedByVoter.set(resolution.effectiveVoter, represented);
        }

        const baseTally = new VotingEngine().tally({ ...vote, votesByUserId: {} }, policy);

        const summary: DelegatedVoteTally = {
            ...baseTally,
            approve: 0,
            reject: 0,
            abstain: 0,
            totalVotes: 0,
            passed: false,
            attributions: [],
            resolutionsByUserId,
        };

        for (const [voterUserId, representedUserIds] of representedByVoter.entries()) {
            const ballot = vote.votesByUserId[voterUserId];
            if (!ballot) {
                continue;
            }

            summary[ballot] += representedUserIds.length;
            summary.totalVotes += representedUserIds.length;
            summary.attributions.push({ voterUserId, ballot, representedUserIds });
        }

        summary.attributions.sort((a, b) => a.voterUserId.localeCompare(b.voterUserId));

        const weightedVote = { ...vote, votesByUserId: {} as VoteDocument["votesByUserId"] };
        for (const attribution of summary.attributions) {
            weightedVote.votesByUserId[attribution.voterUserId] = attribution.ballot;
        }

        const passEval = new VotingEngine().tally(
            {
                ...weightedVote,
                votesByUserId: Object.fromEntries(
                    summary.attributions.flatMap((a) => a.representedUserIds.map((id) => [id, a.ballot] as const)),
                ),
            },
            summary.policy,
        );
        summary.quorumMet = passEval.quorumMet;
        summary.passed = passEval.passed;

        return summary;
    }
}
