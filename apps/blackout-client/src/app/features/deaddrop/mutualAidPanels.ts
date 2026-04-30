import type { ShellPanelEntry } from '../../core/features/types';

export const mutualAidPanels: ShellPanelEntry[] = [
    {
        id: 'mutual-aid.sidebar',
        kind: 'sidebar',
        label: 'Mutual aid',
        to: '/mutual-aid',
        order: 130,
    },
    {
        id: 'mutual-aid.workspace',
        kind: 'workspace',
        label: 'Mutual aid',
        to: '/mutual-aid',
        order: 130,
    },
];
