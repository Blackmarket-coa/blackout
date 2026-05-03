import type { BlackoutFeature } from '../../core/features/types';
import { deadmanNavItems } from './nav';
import { deadmanRoutes } from './routes';
import { deadmanSettings } from './settings';

export const deadmanFeature: BlackoutFeature = {
    id: 'deadman',
    name: 'Deadman Switch',
    customizations: [
        {
            id: 'deadman-management',
            name: 'Deadman Switch Management',
            category: 'workflow plugin',
            capabilityGate: {
                allOf: ['deadman.read'],
                flags: ['deadman'],
            },
            routes: deadmanRoutes,
            navItems: deadmanNavItems,
            settings: deadmanSettings,
        },
    ],
    capabilities: ['deadman.read', 'deadman.write'],
};
