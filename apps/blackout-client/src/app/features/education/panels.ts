import type { ShellPanelEntry } from '../../core/features/types';

export const educationPanels: ShellPanelEntry[] = [
    {
        id: 'education.sidebar',
        kind: 'sidebar',
        label: 'Education',
        to: '/education',
        order: 120,
    },
    {
        id: 'education.workspace',
        kind: 'workspace',
        label: 'Education',
        to: '/education',
        order: 120,
    },
];
