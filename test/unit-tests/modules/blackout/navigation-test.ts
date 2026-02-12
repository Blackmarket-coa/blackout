/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { SettingLevel } from "../../../../src/settings/SettingLevel";
import SettingsStore from "../../../../src/settings/SettingsStore";
import { getBlackoutRouteById, getEnabledBlackoutModuleNavigationItems } from "../../../../src/modules/blackout/navigation";

describe("blackout navigation", () => {
    afterEach(async () => {
        await SettingsStore.setValue("feature_blackout_governance", null, SettingLevel.DEVICE, false);
        await SettingsStore.setValue("feature_blackout_education", null, SettingLevel.DEVICE, false);
        await SettingsStore.setValue("feature_blackout_mutual_aid", null, SettingLevel.DEVICE, false);
    });

    it("returns only modules whose flags are enabled", async () => {
        await SettingsStore.setValue("feature_blackout_governance", null, SettingLevel.DEVICE, true);
        await SettingsStore.setValue("feature_blackout_mutual_aid", null, SettingLevel.DEVICE, true);

        expect(getEnabledBlackoutModuleNavigationItems().map((item) => item.id)).toEqual(["governance", "mutual-aid"]);
        expect(getEnabledBlackoutModuleNavigationItems().map((item) => item.route)).toEqual([
            "blackout/governance",
            "blackout/mutual-aid",
        ]);
    });

    it("returns stable route mappings for module ids", () => {
        expect(getBlackoutRouteById("governance")).toBe("blackout/governance");
        expect(getBlackoutRouteById("education")).toBe("blackout/education");
        expect(getBlackoutRouteById("mutual-aid")).toBe("blackout/mutual-aid");
    });
});
