/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { useEffect } from "react";

import EducationHome from "../components/EducationHome";
import { BlackoutFeature, isBlackoutFeatureEnabled } from "../../blackout/featureFlags";
import { trackBlackoutModuleAdoption } from "../../../services/telemetry/BlackoutTelemetry";

export default function EducationView(): React.JSX.Element | null {
    const isEnabled = isBlackoutFeatureEnabled(BlackoutFeature.Education);

    useEffect(() => {
        if (!isEnabled) {
            return;
        }

        trackBlackoutModuleAdoption("education");
    }, [isEnabled]);

    if (!isEnabled) {
        return null;
    }

    return <EducationHome />;
}
