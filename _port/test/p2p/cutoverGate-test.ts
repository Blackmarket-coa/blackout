/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

import {
    canEnableMetadataOnlyMatrixMode,
    CUTOVER_KILL_SWITCH_STORAGE_KEY,
    CUTOVER_PARITY_STORAGE_KEY,
    CUTOVER_RECOVERY_STORAGE_KEY,
    getCutoverReadiness,
} from "../../src/p2p";

describe("cutoverGate", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it("requires parity and recovery with kill switch off", () => {
        expect(
            canEnableMetadataOnlyMatrixMode({
                featureEnabled: true,
                killSwitchEnabled: false,
                parityTestsPassed: true,
                recoveryTestsPassed: true,
            }),
        ).toBe(true);

        expect(
            canEnableMetadataOnlyMatrixMode({
                featureEnabled: true,
                killSwitchEnabled: true,
                parityTestsPassed: true,
                recoveryTestsPassed: true,
            }),
        ).toBe(false);
    });

    it("reads readiness from localStorage", () => {
        window.localStorage.setItem(CUTOVER_PARITY_STORAGE_KEY, "true");
        window.localStorage.setItem(CUTOVER_RECOVERY_STORAGE_KEY, "true");
        window.localStorage.setItem(CUTOVER_KILL_SWITCH_STORAGE_KEY, "false");

        const readiness = getCutoverReadiness(true);
        expect(readiness.featureEnabled).toBe(true);
        expect(readiness.parityTestsPassed).toBe(true);
        expect(readiness.recoveryTestsPassed).toBe(true);
        expect(readiness.killSwitchEnabled).toBe(false);
    });
});
