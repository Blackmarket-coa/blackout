import type { FeatureRoute } from '../../core/features/types';
import { COMMUNITIES_CANOPY_PATH, COMMUNITIES_DEN_PATH, COMMUNITIES_PATH } from '../../pages/paths';
import CommunitiesView from './CommunitiesView';
import CommunitiesRoute from './CommunitiesRoute';

export const communitiesRoutes: FeatureRoute[] = [
    { path: COMMUNITIES_PATH, component: CommunitiesView },
    { path: COMMUNITIES_CANOPY_PATH, component: CommunitiesRoute },
    { path: COMMUNITIES_DEN_PATH, component: CommunitiesRoute },
];
