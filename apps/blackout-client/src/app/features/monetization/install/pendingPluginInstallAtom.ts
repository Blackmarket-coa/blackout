import { atom } from 'jotai';
import type { NormalizedEntitlement } from '@blackout/core';
import type { SignedPluginBundle } from '@blackout/sdk';

export interface PendingPluginInstall {
    entitlement: NormalizedEntitlement;
    bundle: SignedPluginBundle;
}

/**
 * Set by marketplace flows once a signed bundle has been fetched. When
 * non-null, PluginsView renders the install-approval dialog so the user
 * can review the requested capabilities and surfaces before the install
 * actually runs.
 */
export const pendingPluginInstallAtom = atom<PendingPluginInstall | null>(null);
