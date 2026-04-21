import type { BlackoutFeature } from '../../core/features/types';
import { deaddropNavItems } from './nav';
import { deaddropRoutes } from './routes';
import { deaddropSettings } from './settings';

export const deaddropFeature: BlackoutFeature = {
    id: 'deaddrop',
    name: 'Dead Drop',
    customizations: [
        {
            id: 'deaddrop-interaction',
            name: 'Dead Drop Controls',
            category: 'interaction plugin',
            capabilityGate: {
                allOf: ['deaddrop.read'],
                flags: ['deaddrop'],
            },
            routes: deaddropRoutes,
            navItems: deaddropNavItems,
            settings: deaddropSettings,
        },
    ],
    capabilities: ['deaddrop.read', 'deaddrop.write'],
};
