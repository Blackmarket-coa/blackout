import type { FeatureRoute } from '../../core/features/types';
import { CANOPIES_PATH } from '../../pages/paths';
import CanopyHubView from './CanopyHubView';

/**
 * The canopy *server page* is mounted by `CommunitiesRoute` on the canonical
 * `/communities/:canopyId(/dens/:denId)` route (so deep links keep working);
 * this feature owns the homepage-reachable `/canopies` hub route.
 */
export const canopyRoutes: FeatureRoute[] = [{ path: CANOPIES_PATH, component: CanopyHubView }];
