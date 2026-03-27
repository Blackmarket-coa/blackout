/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import { PosthogAnalytics, type IPosthogEvent } from "../../PosthogAnalytics";

interface BlackoutModuleAdoptionEvent extends IPosthogEvent {
    eventName: "BlackoutModuleAdoption";
    moduleName: "governance" | "education" | "mutual-aid" | "townhall";
}

interface BlackoutModuleErrorEvent extends IPosthogEvent {
    eventName: "BlackoutModuleError";
    moduleName: "governance" | "education" | "mutual-aid" | "townhall";
    operation: string;
}

export function trackBlackoutModuleAdoption(moduleName: BlackoutModuleAdoptionEvent["moduleName"]): void {
    PosthogAnalytics.instance.trackEvent<BlackoutModuleAdoptionEvent>({
        eventName: "BlackoutModuleAdoption",
        moduleName,
    });
}

export function trackBlackoutModuleError(moduleName: BlackoutModuleErrorEvent["moduleName"], operation: string): void {
    PosthogAnalytics.instance.trackEvent<BlackoutModuleErrorEvent>({
        eventName: "BlackoutModuleError",
        moduleName,
        operation,
    });
}
