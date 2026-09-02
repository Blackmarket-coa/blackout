import type { FeatureRoute } from '../../core/features/types';
import AssetShelf from './AssetShelf';
import { ASSETS_PATH } from './nav';

export const communityAssetRoutes: FeatureRoute[] = [{ path: ASSETS_PATH, component: AssetShelf }];
