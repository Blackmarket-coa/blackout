/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import SettingsStore from "../../settings/SettingsStore";

export enum BlackoutFeature {
    Governance = "feature_blackout_governance",
    Education = "feature_blackout_education",
    MutualAid = "feature_blackout_mutual_aid",
}

export function isBlackoutFeatureEnabled(feature: BlackoutFeature): boolean {
    return Boolean(SettingsStore.getValue(feature));
}
