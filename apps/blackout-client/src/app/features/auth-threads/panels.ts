import type { ShellPanelEntry } from '../../core/features/types';

export const authOidcPanels: ShellPanelEntry[] = [
    {
        id: 'auth.oidc.sidebar',
        kind: 'sidebar',
        label: 'Delegated login',
        to: '/auth/oidc',
        order: 110,
    },
];

export const threadActivityPanels: ShellPanelEntry[] = [
    {
        id: 'threads.activity.right-panel',
        kind: 'right-panel',
        label: 'Thread activity',
        to: '/inbox/threads',
        order: 111,
    },
    {
        id: 'threads.activity.sidebar',
        kind: 'sidebar',
        label: 'Thread activity',
        to: '/inbox/threads',
        order: 111,
    },
];
