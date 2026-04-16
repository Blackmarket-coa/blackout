import type { BlackoutFeature } from '../../core/features/types';
import { monetizationNavItems } from './nav';
import { monetizationRoutes } from './routes';

export const monetizationFeature: BlackoutFeature = {
    id: 'monetization',
    name: 'Monetization',
    customizations: [
        {
            id: 'monetization-suite',
            name: 'Monetization Suite',
            category: 'service-backed plugin',
            capabilityGate: {
                flags: ['monetization'],
            },
            routes: monetizationRoutes,
            navItems: monetizationNavItems,
            settings: [],
        },
    ],
    capabilities: [
        'monetization.subscriptions',
        'monetization.boosts',
        'monetization.marketplace',
        'monetization.quests',
        'monetization.payouts',
        'monetization.analytics',
    ],
};
