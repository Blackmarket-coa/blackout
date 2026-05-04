import type { BlackoutFeature } from '../../core/features/types';
import { pluginsNavItems } from './nav';
import { pluginsPanels } from './panels';
import { pluginsRoutes } from './routes';

export const pluginsFeature: BlackoutFeature = {
    id: 'plugins',
    name: 'Plugins',
    customizations: [
        {
            id: 'plugins-shell',
            name: 'Plugins Shell',
            category: 'visual/layout plugin',
            capabilityGate: {
                flags: ['plugins'],
            },
            routes: pluginsRoutes,
            navItems: pluginsNavItems,
            panels: pluginsPanels,
        },
    ],
    capabilities: ['plugins.read'],
};
