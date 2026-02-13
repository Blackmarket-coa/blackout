/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { DelegationGraph } from "../../../src/services/delegation/DelegationGraph";
import { DelegatedVotingEngine } from "../../../src/services/governance/DelegatedVotingEngine";
import { VotingEngine } from "../../../src/services/governance/VotingEngine";

describe("DelegatedVotingEngine", () => {
    const votingEngine = new VotingEngine();
    const delegatedVotingEngine = new DelegatedVotingEngine();

    it("applies delegation chains to weighted tallies", () => {
        const delegationGraph = new DelegationGraph();
        delegationGraph.setDelegation("budget", "@bob:example.org", "@alice:example.org");
        delegationGraph.setDelegation("budget", "@carol:example.org", "@bob:example.org");

        let vote = votingEngine.open("p1", "!room:example.org", 100);
        vote = votingEngine.cast(vote, "@alice:example.org", "approve");

        const tally = delegatedVotingEngine.tally(
            vote,
            "budget",
            ["@alice:example.org", "@bob:example.org", "@carol:example.org"],
            delegationGraph,
        );

        expect(tally.approve).toBe(3);
        expect(tally.reject).toBe(0);
        expect(tally.totalVotes).toBe(3);
        expect(tally.passed).toBe(true);
        expect(tally.attributions).toEqual([
            {
                voterUserId: "@alice:example.org",
                ballot: "approve",
                representedUserIds: ["@alice:example.org", "@bob:example.org", "@carol:example.org"],
            },
        ]);
    });

    it("uses direct votes when a participant overrides delegation", () => {
        const delegationGraph = new DelegationGraph();
        delegationGraph.setDelegation("budget", "@bob:example.org", "@alice:example.org");

        let vote = votingEngine.open("p1", "!room:example.org", 100);
        vote = votingEngine.cast(vote, "@alice:example.org", "approve");
        vote = votingEngine.cast(vote, "@bob:example.org", "reject");

        const tally = delegatedVotingEngine.tally(
            vote,
            "budget",
            ["@alice:example.org", "@bob:example.org"],
            delegationGraph,
        );

        expect(tally.approve).toBe(1);
        expect(tally.reject).toBe(1);
        expect(tally.totalVotes).toBe(2);
        expect(tally.resolutionsByUserId["@bob:example.org"]).toMatchObject({
            effectiveVoter: "@bob:example.org",
            reason: "direct_vote",
        });
    });

    it("applies quorum policy to delegated tallies", () => {
        const delegationGraph = new DelegationGraph();
        delegationGraph.setDelegation("budget", "@bob:example.org", "@alice:example.org");

        let vote = votingEngine.open("p1", "!room:example.org", 100);
        vote = votingEngine.cast(vote, "@alice:example.org", "approve");

        const tally = delegatedVotingEngine.tally(
            vote,
            "budget",
            ["@alice:example.org", "@bob:example.org"],
            delegationGraph,
            { quorum: 3 },
        );

        expect(tally.totalVotes).toBe(2);
        expect(tally.quorumMet).toBe(false);
        expect(tally.passed).toBe(false);
    });
});
