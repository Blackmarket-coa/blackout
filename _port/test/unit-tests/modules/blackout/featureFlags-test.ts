/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import SettingsStore from "../../../../src/settings/SettingsStore";
import { BlackoutFeature, isBlackoutFeatureEnabled } from "../../../../src/modules/blackout/featureFlags";

describe("blackout feature flags", () => {
    const getValueSpy = jest.spyOn(SettingsStore, "getValue");

    beforeEach(() => {
        getValueSpy.mockReset();
    });

    afterAll(() => {
        getValueSpy.mockRestore();
    });

    it("returns true when the primary blackout feature flag is enabled", () => {
        getValueSpy.mockImplementation((key: string) => key === "feature_blackout_governance");

        expect(isBlackoutFeatureEnabled(BlackoutFeature.Governance)).toBe(true);
    });

    it("falls back to legacy aliases", () => {
        getValueSpy.mockImplementation((key: string) => key === "feature_governance");

        expect(isBlackoutFeatureEnabled(BlackoutFeature.Governance)).toBe(true);
    });

    it("supports the townhall primary and legacy feature flags", () => {
        getValueSpy.mockImplementation((key: string) => key === "feature_townhall");

        expect(isBlackoutFeatureEnabled(BlackoutFeature.Townhall)).toBe(true);
    });

    it("returns false when neither primary nor legacy flags are enabled", () => {
        getValueSpy.mockReturnValue(false);

        expect(isBlackoutFeatureEnabled(BlackoutFeature.Education)).toBe(false);
    });
});
