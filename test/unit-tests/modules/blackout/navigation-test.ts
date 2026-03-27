/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { BlackoutFeature } from "../../../../src/modules/blackout/featureFlags";
import { getEnabledBlackoutModuleNavigationItems } from "../../../../src/modules/blackout/navigation";
import SettingsStore from "../../../../src/settings/SettingsStore";

describe("blackout navigation", () => {
    let getValueSpy: jest.SpyInstance;

    beforeEach(() => {
        getValueSpy = jest.spyOn(SettingsStore, "getValue").mockReturnValue(false);
    });

    afterEach(() => {
        getValueSpy.mockRestore();
    });

    it("returns only modules whose flags are enabled", () => {
        getValueSpy.mockImplementation((settingName: string) => {
            return settingName === BlackoutFeature.Governance || settingName === BlackoutFeature.MutualAid;
        });

        expect(getEnabledBlackoutModuleNavigationItems().map((item) => item.id)).toEqual(["governance", "mutual-aid"]);
    });
});
