import type { FeatureRoute } from '../../core/features/types';
import { CREATOR_LISTINGS_PATH, CREATOR_STOREFRONT_PATH } from '../../pages/paths';
import CreatorListings from './CreatorListings';
import CreatorStorefront from './CreatorStorefront';

export const creatorsListingsRoutes: FeatureRoute[] = [
    { path: CREATOR_LISTINGS_PATH, component: CreatorListings },
];

export const creatorsStorefrontRoutes: FeatureRoute[] = [
    { path: CREATOR_STOREFRONT_PATH, component: CreatorStorefront },
];

/** @deprecated kept for backward compat with PR 3 imports. */
export const creatorsRoutes: FeatureRoute[] = creatorsListingsRoutes;
