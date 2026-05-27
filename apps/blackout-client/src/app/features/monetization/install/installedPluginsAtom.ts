import { atom } from 'jotai';
import { atomWithStorage, createJSONStorage } from 'jotai/utils';
import type { InstallScope } from '@blackout/core';
import type { PluginCapability, PluginManifest } from '@blackout/sdk';
import type { OwnedCosmetic } from '../../profile/cosmeticTypes';
import { selectedRoomIdAtom, selectedSpaceIdAtom } from '../../../state/navigation';

export type InstalledPluginStatus = 'enabled' | 'disabled' | 'pending' | 'error';

export interface InstalledPluginRecord {
    entitlementId: string;
    manifest: PluginManifest;
    status: InstalledPluginStatus;
    installedAt: string;
    lastError?: string;
    /**
     * Capabilities the user has granted to this plugin. Defaults to the
     * manifest's declared capability set at install time; the user may
     * revoke individual capabilities later via PluginsView. The sandbox's
     * effective gate is `manifest.capabilities ∩ grantedCapabilities`.
     */
    grantedCapabilities: PluginCapability[];
    /**
     * Scope this install is active in (Phase 1). Absent means a legacy /
     * user-global install that is visible regardless of the current scope —
     * this keeps pre-scoping records and the default (unscoped) shell
     * behaving exactly as before.
     */
    scope?: InstallScope;
    /**
     * For `profile_cosmetic` entitlements: the decoded cosmetic definition. The
     * owned-cosmetics catalog derives from these records, so cosmetics survive a
     * reload and are pruned automatically when the entitlement is revoked.
     */
    cosmetic?: OwnedCosmetic;
}

const INSTALLED_PLUGINS_STORAGE_KEY = 'blackout.plugins.installed.v1';

// Safe localStorage-backed storage: falls back to the default in-memory
// behavior if the browser blocks `JSON.parse` on bad payloads (corrupted
// entry, schema drift). Without this guard a single malformed entry would
// throw at module load and take the whole shell down.
const noopStorage: Storage = {
    length: 0,
    clear: () => undefined,
    key: () => null,
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
};

const safeJsonStorage = createJSONStorage<InstalledPluginRecord[]>(() => {
    try {
        return window.localStorage;
    } catch {
        return noopStorage;
    }
});

/**
 * Persisted across reloads so the homepage plugin rail, sidebar entries,
 * and capability state survive a page refresh. The actual sandbox /
 * feature-module registration is in-memory only and is re-run at boot by
 * `PluginEntitlementHydrator`.
 */
export const installedPluginsAtom = atomWithStorage<InstalledPluginRecord[]>(
    INSTALLED_PLUGINS_STORAGE_KEY,
    [],
    safeJsonStorage,
);

export const installedPluginByIdAtom = atom((get) => {
    const map = new Map<string, InstalledPluginRecord>();
    for (const record of get(installedPluginsAtom)) {
        map.set(record.manifest.id, record);
    }
    return map;
});

/**
 * Explicit override for the current install scope. `null` (the default) means
 * "derive it from navigation" via `effectiveInstallScopeAtom`. Set this only
 * when a surface needs to force a scope that the route can't express (e.g. a
 * creator-studio panel) or in tests.
 */
export const currentInstallScopeAtom = atom<InstallScope | null>(null);

/**
 * Scope inferred from where the shell currently is, using the existing
 * navigation atoms: an open den (Matrix room) is a `den` scope, otherwise an
 * open canopy (Matrix space / community) is a `coalition` scope, otherwise
 * `null` (home / profile / user-global — no filtering).
 */
export const navigationInstallScopeAtom = atom<InstallScope | null>((get) => {
    const denId = get(selectedRoomIdAtom);
    if (denId) return { type: 'den', id: denId };
    const coalitionId = get(selectedSpaceIdAtom);
    if (coalitionId) return { type: 'coalition', id: coalitionId };
    return null;
});

/**
 * The scope plugin surfaces actually filter against: an explicit override when
 * one is set, otherwise the navigation-derived scope. `null` means no filter.
 */
export const effectiveInstallScopeAtom = atom<InstallScope | null>((get) => {
    return get(currentInstallScopeAtom) ?? get(navigationInstallScopeAtom);
});

export function installScopesEqual(a: InstallScope | undefined | null, b: InstallScope | undefined | null): boolean {
    if (!a || !b) return false;
    return a.type === b.type && a.id === b.id;
}

/**
 * Whether a record should be visible/active in the given scope. A record with
 * no scope is treated as user-global and always matches; otherwise it matches
 * only its exact scope. A `null` current scope disables filtering entirely.
 */
export function installVisibleInScope(
    record: InstalledPluginRecord,
    currentScope: InstallScope | null,
): boolean {
    if (!currentScope) return true;
    if (!record.scope) return true;
    return installScopesEqual(record.scope, currentScope);
}

/** Installed plugins visible in the effective scope (see `installVisibleInScope`). */
export const installedPluginsForScopeAtom = atom((get) => {
    const currentScope = get(effectiveInstallScopeAtom);
    return get(installedPluginsAtom).filter((record) => installVisibleInScope(record, currentScope));
});

export function effectiveCapabilities(
    record: InstalledPluginRecord,
): PluginCapability[] {
    const granted = new Set(record.grantedCapabilities);
    return record.manifest.capabilities.filter((cap) => granted.has(cap));
}
