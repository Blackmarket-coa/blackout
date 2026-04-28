import type { ShellPanelEntry } from '../../core/features/types';

/**
 * Right-panel inbox + sidebar entry for the presence digest. Sits next to
 * the existing inbox slots so the canonical shell can render either the
 * legacy unread inbox or the new presence digest from the same panel host
 * once the rewire from BKL-001 lands.
 */
export const presenceDigestPanels: ShellPanelEntry[] = [
    {
        id: 'notifications.presence-digest.right-panel',
        kind: 'right-panel',
        label: 'Presence digest',
        to: '/notifications/presence-digest',
        order: 80,
    },
    {
        id: 'notifications.presence-digest.sidebar',
        kind: 'sidebar',
        label: 'Presence digest',
        to: '/notifications/presence-digest',
        order: 80,
    },
];
