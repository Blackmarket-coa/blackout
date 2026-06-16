import type { FeatureNavItem } from '../../core/features/types';
import {
    GROWTH_AMBASSADORS_PATH,
    GROWTH_QUESTS_PATH,
    GROWTH_REFERRALS_PATH,
} from '../../pages/paths';

export const growthReferralsNavItems: FeatureNavItem[] = [
    { label: 'Referrals', to: GROWTH_REFERRALS_PATH },
];

export const growthAmbassadorNavItems: FeatureNavItem[] = [
    { label: 'Ambassador', to: GROWTH_AMBASSADORS_PATH },
];

export const growthQuestsNavItems: FeatureNavItem[] = [
    { label: 'Quests', to: GROWTH_QUESTS_PATH },
];
