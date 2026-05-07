import type { FeatureRoute } from '../../core/features/types';
import {
    CREATOR_DASHBOARD_PATH,
    CREATOR_LISTINGS_PATH,
    CREATOR_STOREFRONT_PATH,
} from '../../pages/paths';
import CreatorDashboard from './CreatorDashboard';
import CreatorListings from './CreatorListings';
import CreatorStorefront from './CreatorStorefront';

export const creatorsListingsRoutes: FeatureRoute[] = [
    { path: CREATOR_LISTINGS_PATH, component: CreatorListings },
];

export const creatorsStorefrontRoutes: FeatureRoute[] = [
    { path: CREATOR_STOREFRONT_PATH, component: CreatorStorefront },
];

export const creatorsDashboardRoutes: FeatureRoute[] = [
    { path: CREATOR_DASHBOARD_PATH, component: CreatorDashboard },
];
