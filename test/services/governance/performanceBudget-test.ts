/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { DelegationGraph } from "../../../src/services/delegation/DelegationGraph";
import { DelegatedVotingEngine } from "../../../src/services/governance/DelegatedVotingEngine";
import { VotingEngine } from "../../../src/services/governance/VotingEngine";

describe("governance performance budget", () => {
    it("keeps delegated tally under budget for a large-room sample", () => {
        const votingEngine = new VotingEngine();
        const delegatedVotingEngine = new DelegatedVotingEngine();
        const graph = new DelegationGraph();

        const participantUserIds = Array.from({ length: 1000 }, (_, i) => `@u${i}:example.org`);
        let vote = votingEngine.open("p", "!room:example.org");

        for (const userId of participantUserIds.slice(0, 100)) {
            vote = votingEngine.cast(vote, userId, "approve");
        }

        for (const userId of participantUserIds.slice(100)) {
            graph.setDelegation("budget", userId, "@u0:example.org");
        }

        const start = Date.now();
        const tally = delegatedVotingEngine.tally(vote, "budget", participantUserIds, graph);
        const elapsedMs = Date.now() - start;

        expect(tally.totalVotes).toBe(1000);
        expect(elapsedMs).toBeLessThan(2000);
    });
});
