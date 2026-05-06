import type { FeatureRoute } from '../../core/features/types';
import { CREATOR_LISTINGS_PATH } from '../../pages/paths';
import CreatorListings from './CreatorListings';

export const creatorsRoutes: FeatureRoute[] = [
    { path: CREATOR_LISTINGS_PATH, component: CreatorListings },
];
