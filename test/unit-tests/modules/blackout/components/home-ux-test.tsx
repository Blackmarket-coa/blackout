/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { render, screen } from "jest-matrix-react";

import ProposalComposer from "../../../../../src/modules/governance/components/ProposalComposer";
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
    });

    it("shows empty state and disabled actions in education", () => {
        render(<EducationHome />);

        expect(screen.getByText("No study circles yet.")).toBeInTheDocument();
        expect(screen.getByTestId("blackout-education-create-circle")).toBeDisabled();
    });

    it("shows lane summary and empty columns in mutual aid", () => {
        render(<MutualAidHome />);

        expect(screen.getByText("Total needs: 0 · Visible: 0")).toBeInTheDocument();
        expect(screen.getByText("No items in todo.")).toBeInTheDocument();
        expect(screen.getByTestId("blackout-mutual-aid-create-item")).toBeDisabled();
    });
});
