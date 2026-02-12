/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { useEffect } from "react";

import GovernanceHome from "../components/GovernanceHome";
import { BlackoutFeature, isBlackoutFeatureEnabled } from "../../blackout/featureFlags";
import { trackBlackoutModuleAdoption } from "../../../services/telemetry/BlackoutTelemetry";

export default function GovernanceView(): React.JSX.Element | null {
    const isEnabled = isBlackoutFeatureEnabled(BlackoutFeature.Governance);

    useEffect(() => {
        if (!isEnabled) {
            return;
        }

        trackBlackoutModuleAdoption("governance");
    }, [isEnabled]);

    if (!isEnabled) {
        return null;
    }

    return <GovernanceHome />;
}
