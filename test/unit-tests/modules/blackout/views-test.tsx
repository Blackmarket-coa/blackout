/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { render, screen } from "@testing-library/react";

import GovernanceView from "../../../../src/modules/governance/views/GovernanceView";
import EducationView from "../../../../src/modules/education/views/EducationView";
import MutualAidView from "../../../../src/modules/mutualAid/views/MutualAidView";

jest.mock("../../../../src/modules/blackout/featureFlags", () => ({
    ...jest.requireActual("../../../../src/modules/blackout/featureFlags"),
    isBlackoutFeatureEnabled: jest.fn(),
}));

jest.mock("../../../../src/services/telemetry/BlackoutTelemetry", () => ({
    trackBlackoutModuleAdoption: jest.fn(),
}));

import { isBlackoutFeatureEnabled } from "../../../../src/modules/blackout/featureFlags";
import { trackBlackoutModuleAdoption } from "../../../../src/services/telemetry/BlackoutTelemetry";

describe("blackout module views", () => {
    const isBlackoutFeatureEnabledMock = isBlackoutFeatureEnabled as jest.Mock;
    const trackBlackoutModuleAdoptionMock = trackBlackoutModuleAdoption as jest.Mock;

    beforeEach(() => {
        isBlackoutFeatureEnabledMock.mockReset();
        trackBlackoutModuleAdoptionMock.mockReset();
    });

    it("renders governance view and tracks adoption when enabled", () => {
        isBlackoutFeatureEnabledMock.mockReturnValue(true);

        render(<GovernanceView />);

        expect(screen.getByTestId("blackout-governance-view")).toBeInTheDocument();
        expect(trackBlackoutModuleAdoptionMock).toHaveBeenCalledWith("governance");
    });

    it("renders education view and tracks adoption when enabled", () => {
        isBlackoutFeatureEnabledMock.mockReturnValue(true);

        render(<EducationView />);

        expect(screen.getByTestId("blackout-education-view")).toBeInTheDocument();
        expect(trackBlackoutModuleAdoptionMock).toHaveBeenCalledWith("education");
    });

    it("returns null and does not track when disabled", () => {
        isBlackoutFeatureEnabledMock.mockReturnValue(false);

        const { container } = render(<MutualAidView />);

        expect(container).toBeEmptyDOMElement();
        expect(trackBlackoutModuleAdoptionMock).not.toHaveBeenCalled();
    });
});
