import type { BlackoutFeature } from '../../core/features/types';
import { createRoutes } from './routes';

/**
 * Create hub — `/create`. Landing page for creation flows: opens the
 * existing create-canopy modal, points den creation at the canopies area,
 * and hosts the Discord structure importer at `/create/import`.
 *
 * Route-only feature (no shell panel/tab): the hub is reached from
 * onboarding links (`features/onboarding-creator/steps`) and deep links.
 * Gated on `createHub` (default on) plus `shellAppShell` so the surface
 * only mounts inside the AppShell chrome it is designed for.
 */
export const createFeature: BlackoutFeature = {
    id: 'create',
    name: 'Create',
    customizations: [
        {
            id: 'create-hub',
            name: 'Create hub',
            category: 'visual/layout plugin',
            capabilityGate: {
                flags: ['shellAppShell', 'createHub'],
            },
            routes: createRoutes,
        },
    ],
};
