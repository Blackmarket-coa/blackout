import type { BlackoutFeature } from '../../core/features/types';
import { profileNavItems } from './nav';
import { profileRoutes } from './routes';

export const profileFeature: BlackoutFeature = {
    id: 'profile',
    name: 'Profile',
    customizations: [
        {
            id: 'profile-shell',
            name: 'Profile Shell',
            category: 'visual/layout plugin',
            capabilityGate: {
                allOf: ['profile.read'],
                flags: ['profile'],
            },
            routes: profileRoutes,
            navItems: profileNavItems,
        },
    ],
    capabilities: ['profile.read', 'profile.write'],
};
