/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";

import type { NavigationApi } from "../Navigation";
import GovernanceView from "../governance/views/GovernanceView";
import EducationView from "../education/views/EducationView";
import MutualAidView from "../mutualAid/views/MutualAidView";
import { getBlackoutRouteById } from "./navigation";

export function registerBlackoutNavigation(navigationApi: NavigationApi): void {
    navigationApi.registerLocationRenderer(getBlackoutRouteById("governance"), () => <GovernanceView />);
    navigationApi.registerLocationRenderer(getBlackoutRouteById("education"), () => <EducationView />);
    navigationApi.registerLocationRenderer(getBlackoutRouteById("mutual-aid"), () => <MutualAidView />);
}
