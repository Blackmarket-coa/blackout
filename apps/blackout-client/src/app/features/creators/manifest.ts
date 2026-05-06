import type { BlackoutFeature } from '../../core/features/types';
import { creatorsListingsRoutes } from './routes';

/**
 * Creator-side surfaces — `/creator/listings` (PR 3 listing
 * management). The public storefront at `/creators/:userId` is split
 * into its own `creatorsStorefrontFeature` (see `storefrontManifest.ts`)
 * so the two flags can toggle independently without falling foul of
 * the registry composer's single-flag-per-module gate.
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
            routes: creatorsListingsRoutes,
        },
    ],
    capabilities: ['monetization.write'],
};

export { creatorsStorefrontFeature } from './storefrontManifest';
