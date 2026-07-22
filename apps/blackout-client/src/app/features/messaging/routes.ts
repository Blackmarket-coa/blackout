import type { FeatureRoute } from '../../core/features/types';
import {
    DIRECT_CREATE_PATH,
    DIRECT_PATH,
    INBOX_INVITES_PATH,
    INBOX_NOTIFICATIONS_PATH,
    MESSAGING_PATH,
} from '../../pages/paths';
import MessagingPage from './MessagingPage';

/**
 * All five `/messages/*` addresses render the same page; the active tab is
 * derived from the pathname (`resolveMessagingTab`). React Router ranks the
 * longer static paths above the bare `/messages/` hub, so the nested
 * prefixes never shadow each other.
 */
export const messagingRoutes: FeatureRoute[] = [
    { path: MESSAGING_PATH, component: MessagingPage },
    { path: DIRECT_PATH, component: MessagingPage },
    { path: DIRECT_CREATE_PATH, component: MessagingPage },
    { path: INBOX_NOTIFICATIONS_PATH, component: MessagingPage },
    { path: INBOX_INVITES_PATH, component: MessagingPage },
];
