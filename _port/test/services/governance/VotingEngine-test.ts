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

    it("applies operator-safe policy bounds by default", () => {
        let vote = engine.open("p1", "!room:example.org", 100);
        vote = engine.cast(vote, "@alice:example.org", "approve");
        vote = engine.cast(vote, "@bob:example.org", "reject");
        vote = engine.cast(vote, "@carol:example.org", "approve");

        const bounded = engine.tally(vote, {
            quorum: -5,
            threshold: { type: "supermajority", ratio: 0.2 },
        });

        expect(bounded.policy.quorum).toBe(1);
        expect(bounded.policy.threshold.ratio).toBe(0.55);
    });

    it("supports operator tuning overrides for quorum and supermajority ratio", () => {
        const tunedEngine = new VotingEngine({
            defaults: { quorum: 2, threshold: { type: "supermajority", ratio: 0.66 } },
            bounds: {
                quorum: { min: 2, max: 4 },
                supermajorityRatio: { min: 0.6, max: 0.75 },
            },
        });

        let vote = tunedEngine.open("p2", "!room:example.org", 100);
        vote = tunedEngine.cast(vote, "@alice:example.org", "approve");
        vote = tunedEngine.cast(vote, "@bob:example.org", "approve");

        const tally = tunedEngine.tally(vote, {
            quorum: 100,
            threshold: { type: "supermajority", ratio: 0.99 },
        });

        expect(tunedEngine.getPolicyTuning().bounds?.quorum?.max).toBe(4);
        expect(tally.policy.quorum).toBe(4);
        expect(tally.policy.threshold.ratio).toBe(0.75);
        expect(tally.quorumMet).toBe(false);
    });
});
