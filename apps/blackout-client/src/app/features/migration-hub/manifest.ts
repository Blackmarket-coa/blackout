import type { BlackoutFeature } from '../../core/features/types';
import { migrationHubNavItems } from './nav';
import { migrationHubRoutes } from './routes';

export const migrationHubFeature: BlackoutFeature = {
    id: 'migration-hub',
    name: 'Migration Hub',
    customizations: [
        {
            id: 'migration-hub-shell',
            name: 'Migration Hub Shell',
            category: 'service-backed plugin',
            capabilityGate: {
                flags: ['migrationHub'],
            },
            routes: migrationHubRoutes,
            navItems: migrationHubNavItems,
        },
    ],
    capabilities: ['migration.read', 'migration.write'],
};
