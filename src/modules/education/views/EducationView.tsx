/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React from "react";

import { BlackoutFeature, isBlackoutFeatureEnabled } from "../../blackout/featureFlags";

export default function EducationView(): React.JSX.Element | null {
    if (!isBlackoutFeatureEnabled(BlackoutFeature.Education)) {
        return null;
    }

    return <section data-testid="blackout-education-view" />;
}
