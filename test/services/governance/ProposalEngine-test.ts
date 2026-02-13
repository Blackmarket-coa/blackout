/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { ProposalEngine, type GovernancePermissionContext } from "../../../src/services/governance/ProposalEngine";

const permissionContext: GovernancePermissionContext = {
    actorUserId: "@alice:example.org",
    isRoomMember: true,
    powerLevel: 100,
};

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
            permissionContext,
            100,
        );

        expect(proposal.state).toBe("draft");
        expect(proposal.schemaVersion).toBe(2);
        expect(proposal.createdAt).toBe(100);
        expect(proposal.auditTimeline).toHaveLength(1);
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
            permissionContext,
            100,
        );

        const discuss = engine.transition(draft, "discuss", permissionContext, 101);
        const amend = engine.transition(discuss, "amend", permissionContext, 102);
        const closed = engine.transition(amend, "close", permissionContext, 103);
        const decided = engine.transition(closed, "decide", permissionContext, 104);

        expect(decided.state).toBe("decide");
        expect(() => engine.transition(draft, "decide", permissionContext)).toThrow("Invalid proposal transition");
    });

    it("records amendment history", () => {
        const draft = engine.create(
            {
                id: "p-amend",
                roomId: "!room:example.org",
                title: "Policy",
                body: "text",
                authorUserId: "@alice:example.org",
            },
            permissionContext,
        );

        const amended = engine.amend(draft, "new text", permissionContext, 200);
        expect(amended.amendments).toHaveLength(1);
        expect(amended.auditTimeline.at(-1)?.action).toBe("amend");
    });

    it("attaches deterministic jury selection details to proposal records", () => {
        const proposal = engine.create(
            {
                id: "p4",
                roomId: "!room:example.org",
                title: "Policy",
                body: "text",
                authorUserId: "@alice:example.org",
            },
            permissionContext,
        );

        const updated = engine.attachJurySelection(
            proposal,
            {
                selectedJurorIds: ["@alice:example.org", "@bob:example.org"],
                eligibleCount: 4,
                policy: { jurySize: 2, minPowerLevel: 50 },
                proof: {
                    algorithm: "sha256-xof-draw",
                    seedMaterial: "!room:example.org|p4|$event|1735689600000",
                    seedHash: "a".repeat(64),
                    drawHashes: ["b".repeat(64), "c".repeat(64)],
                },
            },
            200,
        );

        expect(updated.jurySelection?.selectedJurorIds).toEqual(["@alice:example.org", "@bob:example.org"]);
        expect(updated.updatedAt).toBe(200);
    });

    it("migrates older documents", () => {
        const migrated = engine.migrate({
            schemaVersion: 1,
            id: "old",
            roomId: "!room:example.org",
            title: "Old",
            body: "old",
            authorUserId: "@alice:example.org",
            state: "draft",
            createdAt: 1,
            updatedAt: 1,
            amendments: [],
            auditTimeline: [],
        });

        expect(migrated.schemaVersion).toBe(2);
    });
});
