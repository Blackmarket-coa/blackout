import { atom } from 'jotai';
import type { ShellPanelEntry } from '../../../core/features/types';
import { installedPluginsAtom } from './installedPluginsAtom';

export const installedPluginPanelsAtom = atom<ShellPanelEntry[]>((get) => {
    const entries: ShellPanelEntry[] = [];
    for (const record of get(installedPluginsAtom)) {
        if (record.status !== 'enabled') continue;
        const pinned = record.manifest.pinnedNav;
        if (!pinned) continue;
        entries.push({
            id: `plugin.${record.manifest.id}.pinnedNav`,
            kind: 'sidebar',
            label: pinned.label,
            to: `/plugins/${encodeURIComponent(record.manifest.id)}`,
            order: pinned.order ?? 100,
        });
    }
    return entries;
});
