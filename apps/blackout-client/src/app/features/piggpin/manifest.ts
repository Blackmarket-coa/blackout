import type { BlackoutFeature } from '../../core/features/types';
import { piggpinNavItems } from './nav';
import { piggpinRoutes } from './routes';

export const piggpinFeature: BlackoutFeature = {
    id: 'piggpin',
    name: 'Map',
    customizations: [
        {
            id: 'piggpin-map',
            name: 'Decentralized Map',
            category: 'visual/layout plugin',
            capabilityGate: {
                flags: ['piggpin'],
            },
            routes: piggpinRoutes,
            navItems: piggpinNavItems,
        },
    ],
    capabilities: ['piggpin.read'],
};
