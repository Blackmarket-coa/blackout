import type { BlackoutFeature } from '../../core/features/types';
import { communitiesNavItems } from './nav';
import { communitiesPanels } from './panels';
import { communitiesRoutes } from './routes';

export const communitiesFeature: BlackoutFeature = {
    id: 'communities',
    name: 'Communities',
    customizations: [
        {
            id: 'communities-shell',
            name: 'Communities Shell',
            category: 'visual/layout plugin',
            capabilityGate: {
                flags: ['communities'],
            },
            routes: communitiesRoutes,
            navItems: communitiesNavItems,
            panels: communitiesPanels,
        },
    ],
    capabilities: ['communities.read'],
};
