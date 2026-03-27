/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { DelegationGraph } from "../../../src/services/delegation/DelegationGraph";
import { ProposalEngine } from "../../../src/services/governance/ProposalEngine";
import { DelegatedVotingEngine } from "../../../src/services/governance/DelegatedVotingEngine";
import { VotingEngine } from "../../../src/services/governance/VotingEngine";

describe("governance + delegation + voting lifecycle", () => {
    it("runs an end-to-end lifecycle with delegated tally", () => {
        const proposalEngine = new ProposalEngine();
        const votingEngine = new VotingEngine();
        const delegatedVotingEngine = new DelegatedVotingEngine();
        const graph = new DelegationGraph();

        const ctx = { actorUserId: "@alice:example.org", isRoomMember: true, powerLevel: 100 };
        let proposal = proposalEngine.create(
            {
                id: "p-e2e",
                roomId: "!room:example.org",
                title: "E2E",
                body: "initial",
                authorUserId: "@alice:example.org",
            },
            ctx,
        );

        proposal = proposalEngine.transition(proposal, "discuss", ctx);
        proposal = proposalEngine.amend(proposal, "revised", ctx);
        proposal = proposalEngine.transition(proposal, "close", ctx);

        let vote = votingEngine.open(proposal.id, proposal.roomId);
        vote = votingEngine.cast(vote, "@alice:example.org", "approve");

        graph.setDelegation("budget", "@bob:example.org", "@alice:example.org");

        const tally = delegatedVotingEngine.tally(vote, "budget", ["@alice:example.org", "@bob:example.org"], graph, {
            quorum: 2,
        });

        expect(tally.passed).toBe(true);
        expect(tally.totalVotes).toBe(2);
        expect(proposal.auditTimeline.length).toBeGreaterThan(1);
    });
});
