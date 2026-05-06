import type { FeatureRoute } from '../../core/features/types';
import { ONBOARDING_CREATOR_PATH } from '../../pages/paths';
import CreatorOnboarding from './CreatorOnboarding';

export const onboardingCreatorRoutes: FeatureRoute[] = [
    { path: ONBOARDING_CREATOR_PATH, component: CreatorOnboarding },
];
