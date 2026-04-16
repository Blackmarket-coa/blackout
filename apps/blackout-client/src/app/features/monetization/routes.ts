import { createElement } from 'react';
import type { FeatureRoute } from '../../core/features/types';
import {
    getMonetizationAppMarketplacePath,
    getMonetizationBoostsPath,
    getMonetizationMarketplacePath,
    getMonetizationPath,
    getMonetizationPayoutsRevenueAnalyticsPath,
    getMonetizationQuestsPath,
    getMonetizationSubscriptionsPlansPath,
    getMonetizationThemePacksPath,
} from '../../pages/pathUtils';
import { AppsSlice } from './apps/AppsSlice';
import { BoostsSlice } from './boosts/BoostsSlice';
import { MarketplaceSlice } from './marketplace/MarketplaceSlice';
import { MonetizationModuleShell } from './MonetizationModuleShell';
import { QuestsSlice } from './quests/QuestsSlice';
import { SubscriptionsSlice } from './subscriptions/SubscriptionsSlice';
import { ThemesSlice } from './themes/ThemesSlice';

const MonetizationOverviewRoutePage = () =>
    createElement(
        MonetizationModuleShell,
        {
            active: 'overview',
            title: 'Monetization suite overview',
            subtitle: 'Unified shell for subscriptions, boosts, quests, marketplace, apps, and themes.',
        },
        createElement(
            'p',
            { style: { margin: 0, color: 'var(--text-secondary)' } },
            'Use the module tabs to access every monetization slice while keeping interaction flow in one shared surface.',
        ),
    );

const MonetizationSubscriptionsPlansRoutePage = () =>
    createElement(
        MonetizationModuleShell,
        {
            active: 'subscriptions',
            title: 'Subscriptions',
            subtitle: 'Plans, upgrade prompts, and add-on packaging.',
        },
        createElement(SubscriptionsSlice),
    );

const MonetizationBoostsRoutePage = () =>
    createElement(
        MonetizationModuleShell,
        {
            active: 'boosts',
            title: 'Boosts dashboard',
            subtitle: 'Tier progress and perk monitoring.',
        },
        createElement(BoostsSlice),
    );

const MonetizationQuestsRoutePage = () =>
    createElement(
        MonetizationModuleShell,
        {
            active: 'quests',
            title: 'Quests',
            subtitle: 'Lifecycle tracking and wallet-facing reward status.',
        },
        createElement(QuestsSlice),
    );

const MonetizationMarketplaceRoutePage = () =>
    createElement(
        MonetizationModuleShell,
        {
            active: 'marketplace',
            title: 'Marketplace',
            subtitle: 'Catalog and product-to-checkout conversion surfaces.',
        },
        createElement(MarketplaceSlice),
    );

const MonetizationAppMarketplaceRoutePage = () =>
    createElement(
        MonetizationModuleShell,
        {
            active: 'apps',
            title: 'App marketplace',
            subtitle: 'Application discovery and permission review.',
        },
        createElement(AppsSlice),
    );

const MonetizationPayoutsRevenueAnalyticsRoutePage = () =>
    createElement(
        MonetizationModuleShell,
        {
            active: 'overview',
            title: 'Payouts and revenue analytics',
            subtitle: 'Operational finance controls remain in the same module shell.',
        },
        createElement(
            'p',
            { style: { margin: 0, color: 'var(--text-secondary)' } },
            'Revenue analytics remains available in this shared shell to avoid context switching across monetization journeys.',
        ),
    );

const MonetizationThemePacksRoutePage = () =>
    createElement(
        MonetizationModuleShell,
        {
            active: 'themes',
            title: 'Theme bundles (BMC)',
            subtitle: 'Theme packs bound to theme catalog, previews, and appearance state.',
        },
        createElement(ThemesSlice),
    );

export const monetizationRoutes: FeatureRoute[] = [
    { path: getMonetizationPath(), component: MonetizationOverviewRoutePage },
    {
        path: getMonetizationSubscriptionsPlansPath(),
        component: MonetizationSubscriptionsPlansRoutePage,
    },
    { path: getMonetizationBoostsPath(), component: MonetizationBoostsRoutePage },
    { path: getMonetizationQuestsPath(), component: MonetizationQuestsRoutePage },
    { path: getMonetizationMarketplacePath(), component: MonetizationMarketplaceRoutePage },
    { path: getMonetizationAppMarketplacePath(), component: MonetizationAppMarketplaceRoutePage },
    {
        path: getMonetizationPayoutsRevenueAnalyticsPath(),
        component: MonetizationPayoutsRevenueAnalyticsRoutePage,
    },
    { path: getMonetizationThemePacksPath(), component: MonetizationThemePacksRoutePage },
];
