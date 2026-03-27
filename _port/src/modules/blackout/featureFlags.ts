/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import type { SettingKey } from "../../settings/Settings";
import SettingsStore from "../../settings/SettingsStore";

export enum BlackoutFeature {
    Governance = "feature_blackout_governance",
    Education = "feature_blackout_education",
    MutualAid = "feature_blackout_mutual_aid",
    DeliberationClustering = "feature_blackout_deliberation_clustering",
    IpfsStorage = "feature_blackout_ipfs_storage",
    Townhall = "feature_blackout_townhall",
}

const LEGACY_FLAG_ALIASES: Partial<Record<BlackoutFeature, string>> = {
    [BlackoutFeature.Governance]: "feature_governance",
    [BlackoutFeature.Education]: "feature_education",
    [BlackoutFeature.MutualAid]: "feature_mutual_aid",
    [BlackoutFeature.DeliberationClustering]: "feature_deliberation_clustering",
    [BlackoutFeature.IpfsStorage]: "feature_ipfs_storage",
    [BlackoutFeature.Townhall]: "feature_townhall",
};

export function isBlackoutFeatureEnabled(feature: BlackoutFeature): boolean {
    const primary = Boolean(SettingsStore.getValue(feature as SettingKey));
    if (primary) {
        return true;
    }

    const alias = LEGACY_FLAG_ALIASES[feature];
    if (!alias) {
        return false;
    }

    return Boolean(SettingsStore.getValue(alias as SettingKey));
}
