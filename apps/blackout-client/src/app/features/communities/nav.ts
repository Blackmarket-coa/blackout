import type { FeatureNavItem } from '../../core/features/types';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';

export const communitiesNavItems: FeatureNavItem[] = [
    { label: BLACKOUT_TERMS.canopy.titlePlural, to: '/communities' },
];
