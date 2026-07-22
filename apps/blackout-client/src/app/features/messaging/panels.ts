import type { ShellPanelEntry } from '../../core/features/types';
import { MESSAGING_PATH } from '../../pages/paths';

export const messagingPanels: ShellPanelEntry[] = [
    {
        id: 'messaging.sidebar',
        kind: 'sidebar',
        label: 'Messages',
        to: MESSAGING_PATH,
        order: 30,
    },
];
