import type { BlackoutFeature } from '../../core/features/types';
import { coalitionsNavItems } from './nav';
import { coalitionsPanels } from './panels';
import { coalitionsRoutes } from './routes';

/**
 * The Coalitions network: multi-member groups with roles, campaigns and a
 * Matrix Space each. Replaces the friends list. Distinct from the per-canopy
 * Commons hub (`features/coalition`, singular), which keeps its own feature id.
 */
export const coalitionsFeature: BlackoutFeature = {
    id: 'coalitions',
    name: 'Coalitions',
    customizations: [
        {
            id: 'coalitions-network',
            name: 'Coalitions network',
            category: 'visual/layout plugin',
            capabilityGate: {
                flags: ['coalitions'],
            },
            routes: coalitionsRoutes,
            navItems: coalitionsNavItems,
            panels: coalitionsPanels,
        },
    ],
    capabilities: ['coalitions.read', 'coalitions.write'],
};
