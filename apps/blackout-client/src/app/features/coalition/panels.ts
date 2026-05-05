import type { ShellPanelEntry } from '../../core/features/types';

export const coalitionPanels: ShellPanelEntry[] = [
    {
        id: 'coalition.sidebar',
        kind: 'sidebar',
        label: 'Coalition',
        to: '/coalition',
        order: 30,
    },
];
