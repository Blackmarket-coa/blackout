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
        });
    });

    it("blocks casts after closure", () => {
        const closed = engine.close(engine.open("p1", "!room:example.org"), 200);
        expect(() => engine.cast(closed, "@alice:example.org", "approve")).toThrow("Voting is already closed");
    });
});
