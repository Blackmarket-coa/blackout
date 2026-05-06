import type { BlackoutFeature } from '../../core/features/types';
import { creatorsStorefrontRoutes } from './routes';

/**
 * Public creator storefront mounted at `/creators/:userId`. Lives in
 * its own feature so it can be enabled independently of the
 * creator-side `/creator/listings` page (PR 3) — buyers can browse
 * storefronts even when the listings management UI is off, and vice
 * versa.
 */
export const creatorsStorefrontFeature: BlackoutFeature = {
    id: 'creators-storefront',
    name: 'Creator storefront',
    customizations: [
        {
            id: 'creators-storefront.public',
            name: 'Creator public storefront',
            category: 'visual/layout plugin',
            capabilityGate: {
                flags: ['creatorsStorefront'],
            },
            routes: creatorsStorefrontRoutes,
        },
    ],
    capabilities: ['monetization.read'],
};
