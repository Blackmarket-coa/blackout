import type { ShellPanelEntry } from '../../core/features/types';

/**
 * Sidebar deep-link for the Mjolnir tab. The settings IA rewire (BKL-007)
 * will hang the actual settings tab off this entry once landed; until
 * then it lets operators link directly into the placeholder.
 */
export const mjolnirSettingsPanels: ShellPanelEntry[] = [
    {
        id: 'moderation.mjolnir.sidebar',
        kind: 'sidebar',
        label: 'Mjolnir moderation',
        to: '/settings/moderation/mjolnir',
        order: 95,
    },
];
