export type MessagingTab = 'dms' | 'notifications' | 'invites' | 'create';

/**
 * Maps a `/messages/*` pathname onto the surface's active tab. The create
 * flow is a sub-state of the locked-in tab (`/messages/locked-in/create/`),
 * so it must be tested before the plain locked-in prefix.
 */
export const resolveMessagingTab = (pathname: string): MessagingTab => {
    if (pathname.startsWith('/messages/notifications')) return 'notifications';
    if (pathname.startsWith('/messages/invites')) return 'invites';
    if (pathname.startsWith('/messages/locked-in/create')) return 'create';
    return 'dms';
};
