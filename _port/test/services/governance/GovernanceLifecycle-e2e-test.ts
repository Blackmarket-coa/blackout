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

    it("keeps governance actions deterministic under bounded policy tuning", () => {
        const proposalEngine = new ProposalEngine();
        const votingEngine = new VotingEngine({
            defaults: { quorum: 2, threshold: { type: "supermajority", ratio: 0.66 } },
            bounds: {
                quorum: { min: 1, max: 5 },
                supermajorityRatio: { min: 0.6, max: 0.8 },
            },
        });
        const delegatedVotingEngine = new DelegatedVotingEngine();
        const graph = new DelegationGraph();

        const ctx = { actorUserId: "@alice:example.org", isRoomMember: true, powerLevel: 100 };
        const proposal = proposalEngine.transition(
            proposalEngine.create(
                {
                    id: "p-bounded",
                    roomId: "!room:example.org",
                    title: "Bounded policy",
                    body: "proposal body",
                    authorUserId: "@alice:example.org",
                },
                ctx,
            ),
            "discuss",
            ctx,
        );

        let vote = votingEngine.open(proposal.id, proposal.roomId);
        vote = votingEngine.cast(vote, "@alice:example.org", "approve");
        vote = votingEngine.cast(vote, "@bob:example.org", "approve");

        graph.setDelegation("budget", "@carol:example.org", "@alice:example.org");

        const directTally = votingEngine.tally(vote, {
            quorum: 0,
            threshold: { type: "supermajority", ratio: 0.2 },
        });
        const delegatedTally = delegatedVotingEngine.tally(
            vote,
            "budget",
            ["@alice:example.org", "@bob:example.org", "@carol:example.org"],
            graph,
            {
                quorum: 2,
                threshold: { type: "supermajority", ratio: 0.6 },
            },
        );

        expect(directTally.policy.quorum).toBe(1);
        expect(directTally.policy.threshold.ratio).toBe(0.6);
        expect(delegatedTally.totalVotes).toBe(3);
        expect(delegatedTally.passed).toBe(true);
    });
});
