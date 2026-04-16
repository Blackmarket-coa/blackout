import type { FeatureNavItem } from '../../core/features/types';
import { getMonetizationPath } from '../../pages/pathUtils';

export const monetizationNavItems: FeatureNavItem[] = [
    { label: 'Monetization', to: getMonetizationPath() },
];
