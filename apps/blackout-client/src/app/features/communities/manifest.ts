import type { BlackoutFeature } from '../../core/features/types';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { communitiesNavItems } from './nav';
import { communitiesPanels } from './panels';
import { communitiesRoutes } from './routes';

export const communitiesFeature: BlackoutFeature = {
    id: 'communities',
    name: BLACKOUT_TERMS.canopy.titlePlural,
    customizations: [
        {
            id: 'communities-shell',
            name: `${BLACKOUT_TERMS.canopy.titlePlural} Shell`,
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
