import type { BlackoutFeature } from '../../core/features/types';
import { educationPanels } from './panels';
import { educationRoutes } from './routes';
import { educationSettings } from './settings';

/**
 * Education feature module — BKL-012.
 *
 * Single capability-gated customization (`education-modules`, gated by
 * `education.modules.read`) behind a new `education` flag. Mirrors
 * `_port`'s `/blackout/education` route.
 */
export const educationFeature: BlackoutFeature = {
    id: 'education',
    name: 'Education',
    customizations: [
        {
            id: 'education-modules',
            name: 'Education Modules',
            category: 'service-backed plugin',
            capabilityGate: {
                allOf: ['education.modules.read'],
                flags: ['education'],
            },
            routes: educationRoutes,
            panels: educationPanels,
            settings: educationSettings,
        },
    ],
    capabilities: ['education.modules.read'],
};
