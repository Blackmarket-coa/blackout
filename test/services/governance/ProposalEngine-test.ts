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

    it("attaches deterministic jury selection details to proposal records", () => {
        const proposal = engine.create({
            id: "p4",
            roomId: "!room:example.org",
            title: "Policy",
            body: "text",
            authorUserId: "@alice:example.org",
        });

        const updated = engine.attachJurySelection(
            proposal,
            {
                selectedJurorIds: ["@alice:example.org", "@bob:example.org"],
                eligibleCount: 4,
                policy: { jurySize: 2, minPowerLevel: 50 },
                proof: {
                    algorithm: "xxhash32-draw",
                    seedMaterial: "!room:example.org|p4|$event|1735689600000",
                    seedHash: "a".repeat(8),
                    drawHashes: ["b".repeat(8), "c".repeat(8)],
                },
            },
            200,
        );

        expect(updated.jurySelection?.selectedJurorIds).toEqual(["@alice:example.org", "@bob:example.org"]);
        expect(updated.updatedAt).toBe(200);
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
