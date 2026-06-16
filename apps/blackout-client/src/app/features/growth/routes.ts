import type { FeatureRoute } from '../../core/features/types';
import {
    GROWTH_AMBASSADORS_PATH,
    GROWTH_QUESTS_PATH,
    GROWTH_REFERRALS_PATH,
} from '../../pages/paths';
import AmbassadorPage from './AmbassadorPage';
import QuestsPage from './QuestsPage';
import ReferralsPage from './ReferralsPage';

export const growthReferralsRoutes: FeatureRoute[] = [
    { path: GROWTH_REFERRALS_PATH, component: ReferralsPage },
];

export const growthAmbassadorRoutes: FeatureRoute[] = [
    { path: GROWTH_AMBASSADORS_PATH, component: AmbassadorPage },
];

export const growthQuestsRoutes: FeatureRoute[] = [
    { path: GROWTH_QUESTS_PATH, component: QuestsPage },
];
