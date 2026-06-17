import type { BlackoutFeature } from '../../core/features/types';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import { canopyRoutes } from './routes';

export const canopyFeature: BlackoutFeature = {
    id: 'canopy',
    name: BLACKOUT_TERMS.canopy.titlePlural,
    customizations: [
        {
            id: 'canopy-server',
            name: `${BLACKOUT_TERMS.canopy.title} Server`,
            category: 'visual/layout plugin',
            capabilityGate: {
                flags: ['canopyServer'],
            },
            routes: canopyRoutes,
        },
    ],
    capabilities: ['communities.read'],
};
