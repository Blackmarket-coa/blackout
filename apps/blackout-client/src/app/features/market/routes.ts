import type { FeatureRoute } from '../../core/features/types';
import { MARKET_LISTING_PATH, MARKET_PATH } from '../../pages/paths';
import MarketShell from './MarketShell';
import MarketListingDetail from './MarketListingDetail';

export const marketRoutes: FeatureRoute[] = [
    { path: MARKET_PATH, component: MarketShell },
    { path: MARKET_LISTING_PATH, component: MarketListingDetail },
];
