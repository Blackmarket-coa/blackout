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
}

export class VotingEngine {
    public open(proposalId: string, roomId: string, now: number = Date.now()): VoteDocument {
        return {
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

    public tally(vote: VoteDocument): VoteTally {
        const summary: VoteTally = {
            approve: 0,
            reject: 0,
            abstain: 0,
            passed: false,
            totalVotes: 0,
        };

        for (const ballot of Object.values(vote.votesByUserId)) {
            summary[ballot] += 1;
            summary.totalVotes += 1;
        }

        summary.passed = summary.approve > summary.reject;
        return summary;
    }
}
