/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { useEffect } from "react";

import MutualAidHome from "../components/MutualAidHome";
import { BlackoutFeature, isBlackoutFeatureEnabled } from "../../blackout/featureFlags";
import { trackBlackoutModuleAdoption } from "../../../services/telemetry/BlackoutTelemetry";

export default function MutualAidView(): React.JSX.Element | null {
    const isEnabled = isBlackoutFeatureEnabled(BlackoutFeature.MutualAid);

    useEffect(() => {
        if (!isEnabled) {
            return;
        }

        trackBlackoutModuleAdoption("mutual-aid");
    }, [isEnabled]);

    if (!isEnabled) {
        return null;
    }

    return <MutualAidHome />;
}
