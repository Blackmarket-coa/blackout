import type { FeatureRoute } from '../../core/features/types';
import CommunitiesView from './CommunitiesView';

export const communitiesRoutes: FeatureRoute[] = [
    { path: '/communities', component: CommunitiesView },
];
