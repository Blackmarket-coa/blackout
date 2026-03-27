/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { _td } from "@element-hq/web-shared-components";

import { BlackoutFeature, isBlackoutFeatureEnabled } from "./featureFlags";

export interface BlackoutModuleNavigationItem {
    id: "governance" | "education" | "mutual-aid";
    feature: BlackoutFeature;
    label: TranslationKey;
}

const BLACKOUT_MODULE_NAVIGATION_ITEMS: readonly BlackoutModuleNavigationItem[] = [
    {
        id: "governance",
        feature: BlackoutFeature.Governance,
        label: _td("blackout|nav_governance"),
    },
    {
        id: "education",
        feature: BlackoutFeature.Education,
        label: _td("blackout|nav_education"),
    },
    {
        id: "mutual-aid",
        feature: BlackoutFeature.MutualAid,
        label: _td("blackout|nav_mutual_aid"),
    },
];

export function getEnabledBlackoutModuleNavigationItems(): BlackoutModuleNavigationItem[] {
    return BLACKOUT_MODULE_NAVIGATION_ITEMS.filter((item) => isBlackoutFeatureEnabled(item.feature));
}

export function getBlackoutRouteById(id: BlackoutModuleNavigationItem["id"]): string {
    return `/blackout/${id}`;
}
