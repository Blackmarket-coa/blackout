import type { BlackoutFeature } from '../../core/features/types';
import { deaddropNavItems } from './nav';
import { deaddropRoutes } from './routes';
import { deaddropSettings } from './settings';

export const deaddropFeature: BlackoutFeature = {
    id: 'deaddrop',
    name: 'Dead Drop',
    routes: deaddropRoutes,
    navItems: deaddropNavItems,
    settings: deaddropSettings,
    capabilities: ['deaddrop.read', 'deaddrop.write'],
};
