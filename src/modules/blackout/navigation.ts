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
    route: string;
}

const BLACKOUT_MODULE_NAVIGATION_ITEMS: readonly BlackoutModuleNavigationItem[] = [
    {
        id: "governance",
        feature: BlackoutFeature.Governance,
        label: _td("blackout|nav_governance"),
        route: "blackout/governance",
    },
    {
        id: "education",
        feature: BlackoutFeature.Education,
        label: _td("blackout|nav_education"),
        route: "blackout/education",
    },
    {
        id: "mutual-aid",
        feature: BlackoutFeature.MutualAid,
        label: _td("blackout|nav_mutual_aid"),
        route: "blackout/mutual-aid",
    },
];

export function getEnabledBlackoutModuleNavigationItems(): BlackoutModuleNavigationItem[] {
    return BLACKOUT_MODULE_NAVIGATION_ITEMS.filter((item) => isBlackoutFeatureEnabled(item.feature));
}


export function getBlackoutRouteById(moduleId: BlackoutModuleNavigationItem["id"]): string {
    const item = BLACKOUT_MODULE_NAVIGATION_ITEMS.find((candidate) => candidate.id === moduleId);
    if (!item) {
        throw new Error(`Unknown Blackout module id: ${moduleId}`);
    }

    return item.route;
}
