/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { render, screen } from "jest-matrix-react";

import * as featureFlags from "../../../../src/modules/blackout/featureFlags";
import TownhallView from "../../../../src/modules/townhall/views/TownhallView";
import * as blackoutTelemetry from "../../../../src/services/telemetry/BlackoutTelemetry";

describe("TownhallView", () => {
    it("renders widget shell and tracks adoption when feature is enabled", () => {
        jest.spyOn(featureFlags, "isBlackoutFeatureEnabled").mockReturnValue(true);
        const telemetrySpy = jest
            .spyOn(blackoutTelemetry, "trackBlackoutModuleAdoption")
            .mockImplementation(jest.fn());

        render(<TownhallView />);

        expect(screen.getByTestId("blackout-townhall-widget-shell")).toBeInTheDocument();
        expect(telemetrySpy).toHaveBeenCalledWith("townhall");
    });

    it("renders nothing when feature is disabled", () => {
        jest.spyOn(featureFlags, "isBlackoutFeatureEnabled").mockReturnValue(false);

        const { container } = render(<TownhallView />);

        expect(container).toBeEmptyDOMElement();
    });
});
