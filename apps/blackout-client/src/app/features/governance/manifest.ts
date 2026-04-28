import type { BlackoutFeature } from '../../core/features/types';
import { governanceNavItems } from './nav';
import { governancePanels } from './panels';
import { governanceRoutes } from './routes';

export const governanceFeature: BlackoutFeature = {
    id: 'governance',
    name: 'Governance',
    customizations: [
        {
            id: 'governance-workbench',
            name: 'Governance Workbench',
            category: 'workflow plugin',
            capabilityGate: {
                allOf: ['governance.read'],
                flags: ['governance'],
            },
            routes: governanceRoutes,
            navItems: governanceNavItems,
            panels: governancePanels,
        },
    ],
    capabilities: ['governance.read', 'governance.write'],
};
