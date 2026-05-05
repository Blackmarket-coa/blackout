import type { ShellPanelEntry } from '../../core/features/types';

export const pluginsPanels: ShellPanelEntry[] = [
    {
        id: 'plugins.sidebar',
        kind: 'sidebar',
        label: 'Plugins',
        to: '/plugins',
        order: 50,
    },
];
