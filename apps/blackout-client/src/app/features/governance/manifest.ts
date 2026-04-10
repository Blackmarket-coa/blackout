import type { BlackoutFeature } from '../../core/features/types';
import { governanceNavItems } from './nav';
import { governanceRoutes } from './routes';

export const governanceFeature: BlackoutFeature = {
    id: 'governance',
    name: 'Governance',
    routes: governanceRoutes,
    navItems: governanceNavItems,
    capabilities: ['governance.read', 'governance.write'],
};
