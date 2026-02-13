/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { render, screen } from "jest-matrix-react";

import * as featureFlags from "../../../../src/modules/blackout/featureFlags";
import EducationView from "../../../../src/modules/education/views/EducationView";
import GovernanceView from "../../../../src/modules/governance/views/GovernanceView";
import MutualAidView from "../../../../src/modules/mutualAid/views/MutualAidView";
import * as blackoutTelemetry from "../../../../src/services/telemetry/BlackoutTelemetry";

describe("blackout module views", () => {
    let isFeatureEnabledSpy: jest.SpyInstance;
    let trackAdoptionSpy: jest.SpyInstance;

    beforeEach(() => {
        isFeatureEnabledSpy = jest.spyOn(featureFlags, "isBlackoutFeatureEnabled").mockReturnValue(false);
        trackAdoptionSpy = jest.spyOn(blackoutTelemetry, "trackBlackoutModuleAdoption").mockImplementation(jest.fn());
    });

    afterEach(() => {
        isFeatureEnabledSpy.mockRestore();
        trackAdoptionSpy.mockRestore();
    });

    it("renders governance view and tracks adoption when enabled", () => {
        isFeatureEnabledSpy.mockReturnValue(true);

        render(<GovernanceView />);

        expect(screen.getByTestId("blackout-governance-view")).toBeInTheDocument();
        expect(trackAdoptionSpy).toHaveBeenCalledWith("governance");
    });

    it("renders education view and tracks adoption when enabled", () => {
        isFeatureEnabledSpy.mockReturnValue(true);

        render(<EducationView />);

        expect(screen.getByTestId("blackout-education-view")).toBeInTheDocument();
        expect(trackAdoptionSpy).toHaveBeenCalledWith("education");
    });

    it("returns null and does not track when disabled", () => {
        isFeatureEnabledSpy.mockReturnValue(false);

        const { container } = render(<MutualAidView />);

        expect(container).toBeEmptyDOMElement();
        expect(trackAdoptionSpy).not.toHaveBeenCalled();
    });
});
