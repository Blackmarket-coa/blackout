/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { getEnabledBlackoutModuleNavigationItems } from "../../../../src/modules/blackout/navigation";

jest.mock("../../../../src/modules/blackout/featureFlags", () => ({
    ...jest.requireActual("../../../../src/modules/blackout/featureFlags"),
    isBlackoutFeatureEnabled: jest.fn(),
}));

import { BlackoutFeature, isBlackoutFeatureEnabled } from "../../../../src/modules/blackout/featureFlags";

describe("blackout navigation", () => {
    const isBlackoutFeatureEnabledMock = isBlackoutFeatureEnabled as jest.Mock;

    beforeEach(() => {
        isBlackoutFeatureEnabledMock.mockReset();
    });

    it("returns only modules whose flags are enabled", () => {
        isBlackoutFeatureEnabledMock.mockImplementation((feature: BlackoutFeature) => {
            return feature === BlackoutFeature.Governance || feature === BlackoutFeature.MutualAid;
        });

        expect(getEnabledBlackoutModuleNavigationItems().map((item) => item.id)).toEqual([
            "governance",
            "mutual-aid",
        ]);
    });
});
