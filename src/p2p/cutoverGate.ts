/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

export interface CutoverReadiness {
    featureEnabled: boolean;
    killSwitchEnabled: boolean;
    parityTestsPassed: boolean;
    recoveryTestsPassed: boolean;
}

export const CUTOVER_PARITY_STORAGE_KEY = "mx_blackout_p2p_cutover_parity_passed";
export const CUTOVER_RECOVERY_STORAGE_KEY = "mx_blackout_p2p_cutover_recovery_passed";
export const CUTOVER_KILL_SWITCH_STORAGE_KEY = "mx_blackout_p2p_cutover_kill_switch";

export function canEnableMetadataOnlyMatrixMode(readiness: CutoverReadiness): boolean {
    return (
        readiness.featureEnabled &&
        readiness.parityTestsPassed &&
        readiness.recoveryTestsPassed &&
        !readiness.killSwitchEnabled
    );
}

function readBooleanEnvFlag(envKey: string): boolean {
    try {
        return process?.env?.[envKey] === "true";
    } catch {
        return false;
    }
}

function readBooleanStorageFlag(storageKey: string): boolean {
    try {
        return globalThis.localStorage?.getItem(storageKey) === "true";
    } catch {
        return false;
    }
}

export function getCutoverReadiness(featureEnabled: boolean): CutoverReadiness {
    return {
        featureEnabled,
        parityTestsPassed:
            readBooleanEnvFlag("BLACKOUT_P2P_PARITY_PASSED") || readBooleanStorageFlag(CUTOVER_PARITY_STORAGE_KEY),
        recoveryTestsPassed:
            readBooleanEnvFlag("BLACKOUT_P2P_RECOVERY_PASSED") || readBooleanStorageFlag(CUTOVER_RECOVERY_STORAGE_KEY),
        killSwitchEnabled:
            readBooleanEnvFlag("BLACKOUT_P2P_KILL_SWITCH") || readBooleanStorageFlag(CUTOVER_KILL_SWITCH_STORAGE_KEY),
    };
}
