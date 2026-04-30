import type { ShellPanelEntry } from '../../core/features/types';

/**
 * Sidebar deep-links for each settings tab. The canonical settings IA
 * (BKL-007's "settings shell rewire") will hang the actual tab strip off
 * these entries once landed; until then they let operators link directly
 * to a tab in the placeholder shell.
 */
export const preferencesPanels: ShellPanelEntry[] = [
    {
        id: 'settings.preferences.sidebar',
        kind: 'sidebar',
        label: 'Preferences',
        to: '/settings/preferences',
        order: 90,
    },
];

export const sidebarPanels: ShellPanelEntry[] = [
    {
        id: 'settings.sidebar.sidebar',
        kind: 'sidebar',
        label: 'Sidebar',
        to: '/settings/sidebar',
        order: 91,
    },
];

export const labsPanels: ShellPanelEntry[] = [
    {
        id: 'settings.labs.sidebar',
        kind: 'sidebar',
        label: 'Labs',
        to: '/settings/labs',
        order: 92,
    },
];
