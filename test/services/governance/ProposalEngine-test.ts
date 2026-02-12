/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { ProposalEngine } from "../../../src/services/governance/ProposalEngine";

describe("ProposalEngine", () => {
    const engine = new ProposalEngine();

    it("creates proposals in draft state", () => {
        const proposal = engine.create(
            {
                id: "p1",
                roomId: "!room:example.org",
                title: "Adopt policy",
                body: "initial",
                authorUserId: "@alice:example.org",
            },
            100,
        );

        expect(proposal.state).toBe("draft");
        expect(proposal.createdAt).toBe(100);
    });

    it("enforces lifecycle transitions", () => {
        const draft = engine.create(
            {
                id: "p2",
                roomId: "!room:example.org",
                title: "Policy",
                body: "text",
                authorUserId: "@alice:example.org",
            },
            100,
        );

        const discuss = engine.transition(draft, "discuss", 101);
        const amend = engine.transition(discuss, "amend", 102);
        const closed = engine.transition(amend, "close", 103);
        const decided = engine.transition(closed, "decide", 104);

        expect(decided.state).toBe("decide");
        expect(() => engine.transition(draft, "decide")).toThrow("Invalid proposal transition");
    });

    it("emits matrix summary event payloads", () => {
        const proposal = engine.create({
            id: "p3",
            roomId: "!room:example.org",
            title: "Policy",
            body: "text",
            authorUserId: "@alice:example.org",
        });

        expect(engine.toSummaryEvent(proposal)).toMatchObject({
            type: "im.blackout.governance.proposal",
            content: proposal,
        });
    });
});
