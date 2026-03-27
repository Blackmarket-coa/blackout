/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { fireEvent, render, screen } from "jest-matrix-react";

import ProposalComposer from "../../../../../src/modules/governance/components/ProposalComposer";
import ProposalList from "../../../../../src/modules/governance/components/ProposalList";
import EducationHome from "../../../../../src/modules/education/components/EducationHome";
import MutualAidHome from "../../../../../src/modules/mutualAid/components/MutualAidHome";

jest.mock("../../../../../src/services/crdt/educationBinding", () => ({
    loadCurriculum: jest.fn(async () => undefined),
    loadStudyCircle: jest.fn(async () => undefined),
    saveCurriculum: jest.fn(async () => undefined),
    saveStudyCircle: jest.fn(async () => undefined),
}));

jest.mock("../../../../../src/services/crdt/mutualAidBinding", () => ({
    loadTaskBoard: jest.fn(async () => undefined),
    saveTaskBoard: jest.fn(async () => undefined),
}));

describe("blackout home ux", () => {
    it("disables proposal create when fields are empty", () => {
        render(<ProposalComposer onCreate={jest.fn()} />);

        expect(screen.getByTestId("blackout-proposal-create")).toBeDisabled();
        expect(screen.getByText("0 characters")).toBeInTheDocument();
        expect(screen.getByTestId("blackout-proposal-digest-mode")).toHaveValue("daily");
        expect(screen.getByTestId("blackout-proposal-decision-window")).toHaveValue("48");
    });

    it("supports governance searchability and state visibility filtering", () => {
        render(
            <ProposalList
                proposals={[
                    {
                        schemaVersion: 2,
                        id: "p1",
                        roomId: "!gov:example.org",
                        title: "Budget Ratification",
                        body: "Thread about annual budget",
                        authorUserId: "@mod:example.org",
                        cadence: { digestMode: "daily", decisionWindowHours: 48, engagementLoopProtection: true },
                        state: "draft",
                        amendments: [],
                        auditTimeline: [],
                        createdAt: 100,
                        updatedAt: 100,
                    },
                    {
                        schemaVersion: 2,
                        id: "p2",
                        roomId: "!gov:example.org",
                        title: "Safety Policy",
                        body: "Thread about anti-abuse policy",
                        authorUserId: "@mod:example.org",
                        cadence: { digestMode: "manual", decisionWindowHours: 72, engagementLoopProtection: true },
                        state: "close",
                        amendments: [],
                        auditTimeline: [],
                        createdAt: 101,
                        updatedAt: 101,
                    },
                ]}
                onSelect={jest.fn()}
            />,
        );

        fireEvent.change(screen.getByTestId("blackout-governance-search"), { target: { value: "budget" } });
        expect(screen.getByTestId("blackout-governance-visible-count")).toHaveTextContent("Visible proposals: 1 / 2");

        fireEvent.change(screen.getByTestId("blackout-governance-state-filter"), { target: { value: "close" } });
        expect(screen.getByTestId("blackout-governance-visible-count")).toHaveTextContent("Visible proposals: 0 / 2");
        expect(screen.getByTestId("blackout-governance-filter-empty")).toBeInTheDocument();
    });

    it("shows empty state and disabled actions in education", () => {
        render(<EducationHome />);

        expect(screen.getByText("No study circles yet.")).toBeInTheDocument();
        expect(screen.getByTestId("blackout-education-create-circle")).toBeDisabled();
    });

    it("shows lane summary and empty columns in mutual aid", () => {
        render(<MutualAidHome />);

        expect(screen.getByText("Total needs: 0 · Visible: 0")).toBeInTheDocument();
        expect(screen.getByText("No items in backlog.")).toBeInTheDocument();
        expect(screen.getByTestId("blackout-mutual-aid-create-item")).toBeDisabled();
    });
});
