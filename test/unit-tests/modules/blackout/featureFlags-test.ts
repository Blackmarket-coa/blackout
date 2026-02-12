/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import SettingsStore from "../../../../src/settings/SettingsStore";
import { BlackoutFeature, isBlackoutFeatureEnabled } from "../../../../src/modules/blackout/featureFlags";

jest.mock("../../../../src/settings/SettingsStore", () => ({
    __esModule: true,
    default: {
        getValue: jest.fn(),
    },
}));

describe("blackout feature flags", () => {
    const getValue = SettingsStore.getValue as jest.Mock;

    beforeEach(() => {
        getValue.mockReset();
    });

    it("returns true when the primary blackout feature flag is enabled", () => {
        getValue.mockImplementation((key: string) => key === "feature_blackout_governance");

        expect(isBlackoutFeatureEnabled(BlackoutFeature.Governance)).toBe(true);
    });

    it("falls back to legacy aliases", () => {
        getValue.mockImplementation((key: string) => key === "feature_governance");

        expect(isBlackoutFeatureEnabled(BlackoutFeature.Governance)).toBe(true);
    });

    it("returns false when neither primary nor legacy flags are enabled", () => {
        getValue.mockReturnValue(false);

        expect(isBlackoutFeatureEnabled(BlackoutFeature.Education)).toBe(false);
    });
});
