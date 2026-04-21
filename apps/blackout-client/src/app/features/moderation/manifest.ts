import type { BlackoutFeature } from '../../core/features/types';
import { moderationNavItems } from './nav';
import { moderationRoutes } from './routes';

export const moderationFeature: BlackoutFeature = {
    id: 'moderation',
    name: 'Moderation',
    customizations: [
        {
            id: 'draupnir-console',
            name: 'Draupnir Console',
            category: 'service-backed plugin',
            capabilityGate: {
                allOf: ['moderation.read'],
                flags: ['moderation'],
            },
            routes: moderationRoutes,
            navItems: moderationNavItems,
        },
    ],
    capabilities: ['moderation.read', 'moderation.write'],
};
