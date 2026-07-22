import type { BlackoutFeature } from '../../core/features/types';
import { messagingRoutes } from './routes';
import { messagingPanels } from './panels';

/**
 * Inbox messaging surface — `/messages/*`. Restores a route body for the
 * inbox shell mode (`modeRouter` has classified these paths as `inbox`
 * since the Cinny migration, but nothing was mounted there): locked-in DM
 * list, mention notifications, room invites, and the
 * `/messages/locked-in/create/?userId=` entrypoint used by profile cards
 * and marketplace "Message vendor" buttons. Conversations themselves open
 * at the canonical den route — this surface lists and routes, it does not
 * re-host the timeline.
 */
export const messagingFeature: BlackoutFeature = {
    id: 'messaging',
    name: 'Messaging',
    customizations: [
        {
            id: 'messaging-inbox',
            name: 'Inbox messaging surface',
            category: 'visual/layout plugin',
            capabilityGate: {
                flags: ['messaging'],
            },
            routes: messagingRoutes,
            panels: messagingPanels,
        },
    ],
};
