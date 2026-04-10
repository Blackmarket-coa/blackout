import type { BlackoutFeature } from '../../core/features/types';
import { moderationNavItems } from './nav';
import { moderationRoutes } from './routes';

export const moderationFeature: BlackoutFeature = {
    id: 'moderation',
    name: 'Moderation',
    routes: moderationRoutes,
    navItems: moderationNavItems,
    capabilities: ['moderation.read', 'moderation.write'],
};
