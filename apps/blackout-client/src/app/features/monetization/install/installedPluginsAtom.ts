import { atom } from 'jotai';
import { atomWithStorage, createJSONStorage } from 'jotai/utils';
import type { InstallScope } from '@blackout/core';
import type { PluginCapability, PluginManifest } from '@blackout/sdk';

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
 * The scope the shell is currently presenting (a den, coalition, creator
 * surface, or the user's own space). `null` means "no scope filter" — the
 * default, which preserves the pre-Phase-1 behavior of showing every
 * installed plugin everywhere.
 */
export const currentInstallScopeAtom = atom<InstallScope | null>(null);

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

/** Installed plugins visible in the current scope (see `installVisibleInScope`). */
export const installedPluginsForScopeAtom = atom((get) => {
    const currentScope = get(currentInstallScopeAtom);
    return get(installedPluginsAtom).filter((record) => installVisibleInScope(record, currentScope));
});

export function effectiveCapabilities(
    record: InstalledPluginRecord,
): PluginCapability[] {
    const granted = new Set(record.grantedCapabilities);
    return record.manifest.capabilities.filter((cap) => granted.has(cap));
}
