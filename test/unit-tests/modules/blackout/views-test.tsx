/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { render, screen } from "jest-matrix-react";

import GovernanceView from "../../../../src/modules/governance/views/GovernanceView";
import EducationView from "../../../../src/modules/education/views/EducationView";
import MutualAidView from "../../../../src/modules/mutualAid/views/MutualAidView";
import { SettingLevel } from "../../../../src/settings/SettingLevel";
import SettingsStore from "../../../../src/settings/SettingsStore";

describe("blackout module views", () => {
    beforeEach(async () => {
        await SettingsStore.setValue("feature_blackout_governance", null, SettingLevel.DEVICE, false);
        await SettingsStore.setValue("feature_blackout_education", null, SettingLevel.DEVICE, false);
        await SettingsStore.setValue("feature_blackout_mutual_aid", null, SettingLevel.DEVICE, false);
    });

    it("renders governance view when enabled", async () => {
        await SettingsStore.setValue("feature_blackout_governance", null, SettingLevel.DEVICE, true);

        render(<GovernanceView />);

        expect(screen.getByTestId("blackout-governance-view")).toBeInTheDocument();
    });

    it("renders education view when enabled", async () => {
        await SettingsStore.setValue("feature_blackout_education", null, SettingLevel.DEVICE, true);

        render(<EducationView />);

        expect(screen.getByTestId("blackout-education-view")).toBeInTheDocument();
    });

    it("returns null when disabled", () => {
        const { container } = render(<MutualAidView />);

        expect(container).toBeEmptyDOMElement();
    });
});
