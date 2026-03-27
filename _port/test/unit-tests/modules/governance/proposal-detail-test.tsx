/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { render, screen } from "jest-matrix-react";

import ProposalDetail from "../../../../src/modules/governance/components/ProposalDetail";
import type { ProposalDocument } from "../../../../src/modules/governance/models/types";

describe("ProposalDetail", () => {
    const proposal: ProposalDocument = {
        id: "proposal-1",
        roomId: "!room:example.org",
        title: "Transit budget",
        body: "Fund free transit for one year",
        authorUserId: "@alice:example.org",
        state: "discuss",
        createdAt: 1735689600000,
        updatedAt: 1735689600000,
        schemaVersion: 1,
        amendments: [],
        auditTimeline: [],
    };

    it("renders deliberation cluster summaries when provided", () => {
        render(
            <ProposalDetail
                proposal={proposal}
                deliberationClusters={[
                    { id: "cluster-1", memberIds: ["@alice:example.org", "@bob:example.org"], centroid: [1, 0, 0] },
                    { id: "cluster-2", memberIds: ["@carol:example.org"], centroid: [0, 1, 0] },
                ]}
                onAdvanceState={jest.fn()}
                onStartVote={jest.fn()}
                onCastVote={jest.fn()}
                onCloseVote={jest.fn()}
            />,
        );

        expect(screen.getByTestId("blackout-deliberation-clusters")).toBeInTheDocument();
        expect(screen.getByText("cluster-1: 2 members")).toBeInTheDocument();
        expect(screen.getByText("cluster-2: 1 members")).toBeInTheDocument();
    });
});
