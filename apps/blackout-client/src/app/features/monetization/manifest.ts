import type { BlackoutFeature, CapabilityGate } from '../../core/features/types';
import { monetizationNavItems } from './nav';
import {
    monetizationBoostsGate,
    monetizationCapabilityCatalog,
    monetizationMarketplaceGate,
    monetizationOverviewGate,
    monetizationQuestsGate,
    monetizationSubscriptionsGate,
} from './gates';
import {
    monetizationAppMarketplaceRoutes,
    monetizationBoostsRoutes,
    monetizationMarketplaceRoutes,
    monetizationOverviewRoutes,
    monetizationPayoutsRevenueAnalyticsRoutes,
    monetizationQuestsRoutes,
    monetizationSubscriptionsRoutes,
    monetizationThemePacksRoutes,
} from './routes';

export const monetizationFeature: BlackoutFeature = {
    id: 'monetization',
    name: 'Monetization',
    customizations: [
        {
            id: 'monetization-sku-suite',
            name: 'Monetization Suite SKU',
            category: 'service-backed plugin',
            capabilityGate: {
                flags: ['monetization', 'monetizationSuite'],
            },
            routes: [
                ...monetizationOverviewRoutes,
                ...monetizationSubscriptionsRoutes,
                ...monetizationBoostsRoutes,
                ...monetizationQuestsRoutes,
                ...monetizationMarketplaceRoutes,
                ...monetizationAppMarketplaceRoutes,
                ...monetizationPayoutsRevenueAnalyticsRoutes,
                ...monetizationThemePacksRoutes,
            ],
            navItems: monetizationNavItems,
            settings: [],
        },
        {
            id: 'monetization-sku-overview',
            name: 'Monetization Overview SKU',
            category: 'service-backed plugin',
            capabilityGate: monetizationOverviewGate,
            routes: monetizationOverviewRoutes,
            navItems: monetizationNavItems,
            settings: [],
        },
        {
            id: 'monetization-sku-subscriptions',
            name: 'Monetization Subscriptions SKU',
            category: 'service-backed plugin',
            capabilityGate: monetizationSubscriptionsGate,
            routes: monetizationSubscriptionsRoutes,
            settings: [],
        },
        {
            id: 'monetization-sku-boosts',
            name: 'Monetization Boosts SKU',
            category: 'service-backed plugin',
            capabilityGate: monetizationBoostsGate,
            routes: monetizationBoostsRoutes,
            settings: [],
        },
        {
            id: 'monetization-sku-quests',
            name: 'Monetization Quests SKU',
            category: 'service-backed plugin',
            capabilityGate: monetizationQuestsGate,
            routes: monetizationQuestsRoutes,
            settings: [],
        },
        {
            id: 'monetization-sku-marketplace',
            name: 'Monetization Marketplace SKU',
            category: 'service-backed plugin',
            capabilityGate: monetizationMarketplaceGate,
            routes: monetizationMarketplaceRoutes,
            settings: [],
        },
        {
            id: 'monetization-sku-app-marketplace',
            name: 'Monetization App Marketplace SKU',
            category: 'service-backed plugin',
            capabilityGate: {
                allOf: ['marketplace.read'],
                flags: ['monetization', 'monetizationApps'],
            } satisfies CapabilityGate,
            routes: monetizationAppMarketplaceRoutes,
            settings: [],
        },
        {
            id: 'monetization-sku-payouts-analytics',
            name: 'Monetization Payouts and Revenue Analytics SKU',
            category: 'service-backed plugin',
            capabilityGate: {
                allOf: ['payouts.read'],
                flags: ['monetization', 'monetizationPayoutAnalytics'],
            } satisfies CapabilityGate,
            routes: monetizationPayoutsRevenueAnalyticsRoutes,
            settings: [],
        },
        {
            id: 'monetization-sku-theme-packs',
            name: 'Monetization Theme Packs SKU',
            category: 'service-backed plugin',
            capabilityGate: {
                allOf: ['themes.commerce'],
                flags: ['monetization', 'monetizationThemes'],
            } satisfies CapabilityGate,
            routes: monetizationThemePacksRoutes,
            settings: [],
        },
    ],
    capabilities: [...monetizationCapabilityCatalog],
};
