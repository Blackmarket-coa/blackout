import type { BlackoutFeature } from '../../core/features/types';
import { coalitionNavItems } from './nav';
import { coalitionPanels } from './panels';
import { coalitionRoutes } from './routes';

export const coalitionFeature: BlackoutFeature = {
    id: 'coalition',
    name: 'Coalition',
    customizations: [
        {
            id: 'coalition-shell',
            name: 'Coalition Shell',
            category: 'visual/layout plugin',
            capabilityGate: {
                flags: ['coalition'],
            },
            routes: coalitionRoutes,
            navItems: coalitionNavItems,
            panels: coalitionPanels,
        },
    ],
    capabilities: ['coalition.read', 'coalition.write'],
};
