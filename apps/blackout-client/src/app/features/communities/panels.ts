import type { ShellPanelEntry } from '../../core/features/types';

export const communitiesPanels: ShellPanelEntry[] = [
    {
        id: 'communities.sidebar',
        kind: 'sidebar',
        label: 'Communities',
        to: '/communities',
        order: 20,
    },
];
