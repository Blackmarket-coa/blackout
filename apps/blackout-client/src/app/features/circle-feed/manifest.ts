import type { BlackoutFeature } from '../../core/features/types';
import { circleFeedNavItems } from './nav';
import { circleFeedPanels } from './panels';
import { circleFeedRoutes } from './routes';

export const circleFeedFeature: BlackoutFeature = {
    id: 'circle-feed',
    name: 'Circle & Reach Feed',
    customizations: [
        {
            id: 'circle-feed-shell',
            name: 'Circle & Reach Shell',
            category: 'visual/layout plugin',
            capabilityGate: {
                flags: ['circleFeed'],
            },
            routes: circleFeedRoutes,
            navItems: circleFeedNavItems,
            panels: circleFeedPanels,
        },
    ],
    capabilities: ['feed.read', 'feed.relay'],
};
