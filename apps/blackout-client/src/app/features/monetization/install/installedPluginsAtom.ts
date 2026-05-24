import { atom } from 'jotai';
import { atomWithStorage, createJSONStorage } from 'jotai/utils';
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

export function effectiveCapabilities(
    record: InstalledPluginRecord,
): PluginCapability[] {
    const granted = new Set(record.grantedCapabilities);
    return record.manifest.capabilities.filter((cap) => granted.has(cap));
}
