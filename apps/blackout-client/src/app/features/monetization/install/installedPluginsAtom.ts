import { atom } from 'jotai';
import type { PluginManifest } from '@blackout/sdk';

export type InstalledPluginStatus = 'enabled' | 'disabled' | 'pending' | 'error';

export interface InstalledPluginRecord {
    entitlementId: string;
    manifest: PluginManifest;
    status: InstalledPluginStatus;
    installedAt: string;
    lastError?: string;
}

export const installedPluginsAtom = atom<InstalledPluginRecord[]>([]);

export const installedPluginByIdAtom = atom((get) => {
    const map = new Map<string, InstalledPluginRecord>();
    for (const record of get(installedPluginsAtom)) {
        map.set(record.manifest.id, record);
    }
    return map;
});
