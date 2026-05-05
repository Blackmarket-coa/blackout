import type { BlackoutFeature } from '../../core/features/types';
import { coliseumNavItems } from './nav';
import { coliseumPanels } from './panels';
import { coliseumRoutes } from './routes';

export const coliseumFeature: BlackoutFeature = {
    id: 'coliseum',
    name: 'Coliseum',
    customizations: [
        {
            id: 'coliseum-shell',
            name: 'Coliseum Shell',
            category: 'visual/layout plugin',
            capabilityGate: {
                allOf: ['coliseum.read'],
                flags: ['coliseum'],
            },
            routes: coliseumRoutes,
            navItems: coliseumNavItems,
            panels: coliseumPanels,
        },
    ],
    capabilities: ['coliseum.read', 'coliseum.write'],
};
