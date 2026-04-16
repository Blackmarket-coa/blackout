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
import { MonetizationRoutePage } from './MonetizationRoutePage';

const MonetizationOverviewRoutePage = () =>
    createElement(MonetizationRoutePage, { title: 'Monetization' });
const MonetizationSubscriptionsPlansRoutePage = () =>
    createElement(MonetizationRoutePage, { title: 'Subscriptions / Plans' });
const MonetizationBoostsRoutePage = () => createElement(MonetizationRoutePage, { title: 'Boosts' });
const MonetizationQuestsRoutePage = () => createElement(MonetizationRoutePage, { title: 'Quests' });
const MonetizationMarketplaceRoutePage = () =>
    createElement(MonetizationRoutePage, { title: 'Marketplace' });
const MonetizationAppMarketplaceRoutePage = () =>
    createElement(MonetizationRoutePage, { title: 'App Marketplace' });
const MonetizationPayoutsRevenueAnalyticsRoutePage = () =>
    createElement(MonetizationRoutePage, { title: 'Payouts / Revenue Analytics' });
const MonetizationThemePacksRoutePage = () =>
    createElement(MonetizationRoutePage, { title: 'Theme Packs (BMC Themes)' });

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
