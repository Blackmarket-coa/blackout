import { atom } from 'jotai';
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

export const installedPluginsAtom = atom<InstalledPluginRecord[]>([]);

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
