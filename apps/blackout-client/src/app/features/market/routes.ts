import type { FeatureRoute } from '../../core/features/types';
import { MARKET_PATH } from '../../pages/paths';
import MarketShell from './MarketShell';

export const marketRoutes: FeatureRoute[] = [{ path: MARKET_PATH, component: MarketShell }];
