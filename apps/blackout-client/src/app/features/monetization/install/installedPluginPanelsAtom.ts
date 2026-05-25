import { atom } from 'jotai';
import type { ShellPanelEntry } from '../../../core/features/types';
import { installedPluginsForScopeAtom } from './installedPluginsAtom';

export const installedPluginPanelsAtom = atom<ShellPanelEntry[]>((get) => {
    const entries: ShellPanelEntry[] = [];
    for (const record of get(installedPluginsForScopeAtom)) {
        if (record.status !== 'enabled') continue;
        const manifest = record.manifest;
        const route = `/plugins/${encodeURIComponent(manifest.id)}`;

        const pinned = manifest.pinnedNav;
        if (pinned) {
            entries.push({
                id: `plugin.${manifest.id}.pinnedNav`,
                kind: 'sidebar',
                label: pinned.label,
                to: route,
                order: pinned.order ?? 100,
            });
        }

        const rightPanel = manifest.rightPanel;
        if (rightPanel) {
            entries.push({
                id: `plugin.${manifest.id}.rightPanel.${rightPanel.id}`,
                kind: 'right-panel',
                label: rightPanel.label,
                to: route,
                order: rightPanel.order ?? 100,
            });
        }

        const mobileTab = manifest.mobileTab;
        if (mobileTab) {
            entries.push({
                id: `plugin.${manifest.id}.mobileTab.${mobileTab.id}`,
                kind: 'mobile-tab',
                label: mobileTab.label,
                to: route,
                order: mobileTab.order ?? 100,
            });
        }
    }
    return entries;
});
