import type { BlackoutFeature } from '../../core/features/types';
import { presenceDigestPanels } from './panels';
import { presenceDigestRoutes } from './routes';
import {
    notificationRulesSettings,
    presenceDigestSettings,
} from './settings';

/**
 * Notifications-presence feature module — BKL-004.
 *
 * Two customizations:
 *   - `notifications-rules`     gated by `notifications.rules.manage`
 *   - `notifications-presence`  gated by `notifications.presence.read`
 *
 * Both customizations sit behind the `notificationsPresence` flag so the
 * default shell stays unchanged until operators opt in.
 */
export const notificationsPresenceFeature: BlackoutFeature = {
    id: 'notifications-presence',
    name: 'Notifications & Presence',
    customizations: [
        {
            id: 'notifications-rules',
            name: 'Notification Rules',
            category: 'workflow plugin',
            capabilityGate: {
                allOf: ['notifications.rules.manage'],
                flags: ['notificationsPresence'],
            },
            settings: notificationRulesSettings,
        },
        {
            id: 'notifications-presence',
            name: 'Presence Digest Inbox',
            category: 'workflow plugin',
            capabilityGate: {
                allOf: ['notifications.presence.read'],
                flags: ['notificationsPresence'],
            },
            routes: presenceDigestRoutes,
            panels: presenceDigestPanels,
            settings: presenceDigestSettings,
        },
    ],
    capabilities: [
        'notifications.rules.manage',
        'notifications.presence.read',
    ],
};
