/*
Copyright 2026 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import React, { useEffect } from "react";

import { BlackoutFeature, isBlackoutFeatureEnabled } from "../../blackout/featureFlags";
import TownhallWidgetShell from "../components/TownhallWidgetShell";
import { trackBlackoutModuleAdoption } from "../../../services/telemetry/BlackoutTelemetry";

const DEMO_CONTEXT = {
    roomId: "!blackout-townhall-staging:local",
    userId: "@staging-demo:blackout.local",
    displayName: "Staging Demo",
};

export default function TownhallView(): JSX.Element | null {
    const enabled = isBlackoutFeatureEnabled(BlackoutFeature.Townhall);

    useEffect(() => {
        if (enabled) {
            trackBlackoutModuleAdoption("townhall");
        }
    }, [enabled]);

    if (!enabled) {
        return null;
    }

    return <TownhallWidgetShell context={DEMO_CONTEXT} />;
}
