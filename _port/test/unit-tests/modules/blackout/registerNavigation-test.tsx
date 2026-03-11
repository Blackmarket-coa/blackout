/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { NavigationApi } from "../../../../src/modules/Navigation";
import { registerBlackoutNavigation } from "../../../../src/modules/blackout/registerNavigation";

describe("registerBlackoutNavigation", () => {
    it("registers location renderers for each blackout module route", () => {
        const navigationApi = new NavigationApi();

        registerBlackoutNavigation(navigationApi);

        expect(navigationApi.locationRenderers.has("blackout/governance")).toBe(true);
        expect(navigationApi.locationRenderers.has("blackout/education")).toBe(true);
        expect(navigationApi.locationRenderers.has("blackout/mutual-aid")).toBe(true);
    });
});
