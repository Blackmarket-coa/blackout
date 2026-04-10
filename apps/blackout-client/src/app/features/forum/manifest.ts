import type { BlackoutFeature } from '../../core/features/types';
import { forumNavItems } from './nav';
import { forumRoutes } from './routes';

export const forumFeature: BlackoutFeature = {
    id: 'forum',
    name: 'Forum',
    routes: forumRoutes,
    navItems: forumNavItems,
    capabilities: ['forum.read', 'forum.write'],
};
