import type { BlackoutFeature } from '../../core/features/types';
import { coalitionNavItems } from './nav';
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
                allOf: ['coalition.read'],
                flags: ['coalition'],
            },
            routes: coalitionRoutes,
            navItems: coalitionNavItems,
        },
    ],
    capabilities: ['coalition.read', 'coalition.write'],
};
