/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { SettingLevel } from "../../../../src/settings/SettingLevel";
import SettingsStore from "../../../../src/settings/SettingsStore";
import { BlackoutFeature, isBlackoutFeatureEnabled } from "../../../../src/modules/blackout/featureFlags";

describe("blackout feature flags", () => {
    afterEach(async () => {
        await SettingsStore.setValue("feature_blackout_governance", null, SettingLevel.DEVICE, false);
        await SettingsStore.setValue("feature_blackout_education", null, SettingLevel.DEVICE, false);
    });

    it("returns true when the primary blackout feature flag is enabled", async () => {
        await SettingsStore.setValue("feature_blackout_governance", null, SettingLevel.DEVICE, true);

        expect(isBlackoutFeatureEnabled(BlackoutFeature.Governance)).toBe(true);
    });

    it("returns false when only a non-registered legacy alias would be enabled", () => {
        expect(isBlackoutFeatureEnabled(BlackoutFeature.Governance)).toBe(false);
    });

    it("returns false when neither primary nor legacy flags are enabled", async () => {
        await SettingsStore.setValue("feature_blackout_education", null, SettingLevel.DEVICE, false);

        expect(isBlackoutFeatureEnabled(BlackoutFeature.Education)).toBe(false);
    });
});
