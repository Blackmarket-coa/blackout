import type { BlackoutFeature } from '../../core/features/types';
import { creatorsRoutes } from './routes';

/**
 * Creator surfaces — `/creator/listings` for now (PR 3). Subsequent
 * PRs add `/creators/:userId` (storefront, PR 4) and the
 * earnings/payouts dashboard (PR 9). The manifest deliberately omits
 * a `mobile-tab` panel; creators reach this surface from the legacy
 * monetization sidebar entry today and from the future Creator
 * dashboard mode in PR 9.
 */
export const creatorsFeature: BlackoutFeature = {
    id: 'creators',
    name: 'Creators',
    customizations: [
        {
            id: 'creators-listings',
            name: 'Creator listings',
            category: 'workflow plugin',
            capabilityGate: {
                flags: ['creatorsListings'],
            },
            routes: creatorsRoutes,
        },
    ],
    capabilities: ['monetization.write'],
};
