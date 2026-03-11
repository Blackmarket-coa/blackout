/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { GovernanceStateStore } from "../../../src/services/governance/GovernanceStateStore";

describe("GovernanceStateStore", () => {
    it("persists proposals and votes by room + proposal ID and emits room events", async () => {
        const store = new GovernanceStateStore();
        const proposal = {
            schemaVersion: 2,
            id: "proposal-1",
            roomId: "!room:example.org",
            title: "Policy",
            body: "Body",
            authorUserId: "@alice:example.org",
            state: "draft" as const,
            amendments: [],
            auditTimeline: [],
            createdAt: 1,
            updatedAt: 1,
        };

        await store.persistProposal(proposal);
        await store.persistVote({
            schemaVersion: 1,
            proposalId: proposal.id,
            roomId: proposal.roomId,
            votesByUserId: { "@alice:example.org": "approve" as const },
            openedAt: 2,
        });

        await expect(store.loadProposal(proposal.roomId, proposal.id)).resolves.toMatchObject(proposal);
        await expect(store.loadVote(proposal.roomId, proposal.id)).resolves.toMatchObject({ proposalId: proposal.id });
        expect(store.getProposalSnapshot(proposal.roomId, proposal.id)).toBeInstanceOf(Uint8Array);
        expect(store.listRoomEvents(proposal.roomId)).toHaveLength(2);
    });
});
