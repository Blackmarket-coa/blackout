/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { VotingEngine } from "../../../src/services/governance/VotingEngine";

describe("VotingEngine", () => {
    const engine = new VotingEngine();

    it("tallies simple-majority approval voting", () => {
        let vote = engine.open("p1", "!room:example.org", 100);
        vote = engine.cast(vote, "@alice:example.org", "approve");
        vote = engine.cast(vote, "@bob:example.org", "reject");
        vote = engine.cast(vote, "@carol:example.org", "approve");

        const tally = engine.tally(vote);
        expect(tally).toMatchObject({
            approve: 2,
            reject: 1,
            abstain: 0,
            passed: true,
            totalVotes: 3,
            quorumMet: true,
        });
    });

    it("blocks casts after closure", () => {
        const closed = engine.close(engine.open("p1", "!room:example.org"), 200);
        expect(() => engine.cast(closed, "@alice:example.org", "approve")).toThrow("Voting is already closed");
    });

    it("supports quorum and supermajority policies", () => {
        let vote = engine.open("p1", "!room:example.org", 100);
        vote = engine.cast(vote, "@alice:example.org", "approve");
        vote = engine.cast(vote, "@bob:example.org", "reject");

        const belowQuorum = engine.tally(vote, { quorum: 3 });
        expect(belowQuorum.quorumMet).toBe(false);
        expect(belowQuorum.passed).toBe(false);

        vote = engine.cast(vote, "@carol:example.org", "approve");
        vote = engine.cast(vote, "@dani:example.org", "approve");

        const supermajority = engine.tally(vote, {
            quorum: 3,
            threshold: { type: "supermajority", ratio: 0.75 },
        });

        expect(supermajority.quorumMet).toBe(true);
        expect(supermajority.passed).toBe(true);
    });
});
