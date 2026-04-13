import type { BlackoutFeature } from '../../core/features/types';
import { forumNavItems } from './nav';
import { forumRoutes } from './routes';

export const forumFeature: BlackoutFeature = {
    id: 'forum',
    name: 'Forum',
    customizations: [
        {
            id: 'forum-layout-surface',
            name: 'Forum Layout Surface',
            category: 'visual/layout plugin',
            capabilityGate: {
                allOf: ['forum.read'],
                flags: ['forum'],
            },
            routes: forumRoutes,
            navItems: forumNavItems,
        },
    ],
    capabilities: ['forum.read', 'forum.write'],
};
