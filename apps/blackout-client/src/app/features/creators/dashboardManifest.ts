import type { BlackoutFeature } from '../../core/features/types';
import { creatorsDashboardRoutes } from './routes';

/**
 * Creator dashboard mounted at `/creator` (PR 9). Lives in its own
 * feature so it can toggle independently of
 * `creatorsListings` / `creatorsStorefront` — same pattern PR 4
 * applied to the storefront split.
 */
export const creatorsDashboardFeature: BlackoutFeature = {
    id: 'creators-dashboard',
    name: 'Creator dashboard',
    customizations: [
        {
            id: 'creators-dashboard.landing',
            name: 'Creator dashboard landing',
            category: 'workflow plugin',
            capabilityGate: {
                flags: ['creatorsDashboard'],
            },
            routes: creatorsDashboardRoutes,
        },
    ],
    capabilities: ['monetization.write'],
};
