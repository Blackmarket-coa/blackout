import { createElement } from 'react';
import {
    isCapabilityGateSatisfied,
    resolveFeatureCustomizations,
    type CapabilityGateContext,
} from '../../core/features/capabilityGate';
import type { CapabilityGate, FeatureRoute } from '../../core/features/types';
import { runtimeFeatureFlags } from '../../core/features/featureFlags';
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
import {
    monetizationBoostsGate,
    monetizationCapabilityCatalog,
    monetizationMarketplaceGate,
    monetizationPayoutsAnalyticsGate,
    monetizationQuestsGate,
    monetizationSubscriptionsGate,
    monetizationThemePacksGate,
} from './gates';
import { MarketplaceSlice } from './marketplace/MarketplaceSlice';
import { MonetizationModuleShell } from './MonetizationModuleShell';
import { QuestsSlice } from './quests/QuestsSlice';
import { SubscriptionsSlice } from './subscriptions/SubscriptionsSlice';
import { ThemesSlice } from './themes/ThemesSlice';

const monetizationGateContext: CapabilityGateContext = {
    capabilities: [...monetizationCapabilityCatalog],
    flags: runtimeFeatureFlags,
};

const unavailablePanel = (title: string, reason: string) =>
    createElement(
        'section',
        {
            style: {
                border: '1px solid var(--border-default)',
                borderRadius: 10,
                background: 'var(--bg-input)',
                padding: 12,
                display: 'grid',
                gap: 6,
            },
        },
        createElement('strong', undefined, `${title} unavailable`),
        createElement('p', { style: { margin: 0, color: 'var(--text-secondary)' } }, reason)
    );

const gatedMonetizationSlice = (
    gate: CapabilityGate,
    title: string,
    component: () => ReturnType<typeof createElement>
) => {
    if (isCapabilityGateSatisfied(gate, monetizationGateContext)) return component();

    return unavailablePanel(
        title,
        'This panel is unavailable in the current workspace plan, capability scope, or kill-switch preset.'
    );
};

const MonetizationOverviewRoutePage = () => {
    const enabledCustomizations = resolveFeatureCustomizations(
        {
            id: 'monetization',
            name: 'Monetization',
            customizations: [
                {
                    id: 'subscriptions',
                    name: 'Subscriptions',
                    category: 'service-backed plugin',
                    capabilityGate: monetizationSubscriptionsGate,
                },
                {
                    id: 'boosts',
                    name: 'Boosts',
                    category: 'service-backed plugin',
                    capabilityGate: monetizationBoostsGate,
                },
                {
                    id: 'quests',
                    name: 'Quests',
                    category: 'service-backed plugin',
                    capabilityGate: monetizationQuestsGate,
                },
                {
                    id: 'marketplace',
                    name: 'Marketplace',
                    category: 'service-backed plugin',
                    capabilityGate: monetizationMarketplaceGate,
                },
                {
                    id: 'payouts-analytics',
                    name: 'Payouts and Analytics',
                    category: 'service-backed plugin',
                    capabilityGate: monetizationPayoutsAnalyticsGate,
                },
                {
                    id: 'themes',
                    name: 'Themes',
                    category: 'service-backed plugin',
                    capabilityGate: monetizationThemePacksGate,
                },
            ],
        },
        monetizationGateContext
    );

    return createElement(
        MonetizationModuleShell,
        {
            active: 'overview',
            title: 'Monetization suite overview',
            subtitle:
                'Unified shell for subscriptions, boosts, quests, marketplace, apps, and themes.',
        },
        createElement(
            'div',
            { style: { display: 'grid', gap: 8 } },
            createElement(
                'p',
                { style: { margin: 0, color: 'var(--text-secondary)' } },
                'Use the module tabs to access every monetization slice while keeping interaction flow in one shared surface.'
            ),
            createElement(
                'small',
                { style: { color: 'var(--text-secondary)' } },
                `Enabled customizations: ${
                    enabledCustomizations.map((item) => item.name).join(', ') || 'none'
                }`
            )
        )
    );
};

const MonetizationSubscriptionsPlansRoutePage = () =>
    createElement(
        MonetizationModuleShell,
        {
            active: 'subscriptions',
            title: 'Subscriptions',
            subtitle: 'Plans, upgrade prompts, and add-on packaging.',
        },
        gatedMonetizationSlice(monetizationSubscriptionsGate, 'Subscriptions', () =>
            createElement(SubscriptionsSlice)
        )
    );

const MonetizationBoostsRoutePage = () =>
    createElement(
        MonetizationModuleShell,
        {
            active: 'boosts',
            title: 'Boosts dashboard',
            subtitle: 'Tier progress and perk monitoring.',
        },
        gatedMonetizationSlice(monetizationBoostsGate, 'Boosts', () => createElement(BoostsSlice))
    );

const MonetizationQuestsRoutePage = () =>
    createElement(
        MonetizationModuleShell,
        {
            active: 'quests',
            title: 'Quests',
            subtitle: 'Lifecycle tracking and wallet-facing reward status.',
        },
        gatedMonetizationSlice(monetizationQuestsGate, 'Quests', () => createElement(QuestsSlice))
    );

const MonetizationMarketplaceRoutePage = () =>
    createElement(
        MonetizationModuleShell,
        {
            active: 'marketplace',
            title: 'Marketplace',
            subtitle: 'Catalog and product-to-checkout conversion surfaces.',
        },
        gatedMonetizationSlice(monetizationMarketplaceGate, 'Marketplace', () =>
            createElement(MarketplaceSlice)
        )
    );

const MonetizationAppMarketplaceRoutePage = () =>
    createElement(
        MonetizationModuleShell,
        {
            active: 'apps',
            title: 'App marketplace',
            subtitle: 'Application discovery and permission review.',
        },
        gatedMonetizationSlice(monetizationMarketplaceGate, 'App marketplace', () =>
            createElement(AppsSlice)
        )
    );

const MonetizationPayoutsRevenueAnalyticsRoutePage = () =>
    createElement(
        MonetizationModuleShell,
        {
            active: 'overview',
            title: 'Payouts and revenue analytics',
            subtitle: 'Operational finance controls remain in the same module shell.',
        },
        gatedMonetizationSlice(
            monetizationPayoutsAnalyticsGate,
            'Payouts and revenue analytics',
            () =>
                createElement(
                    'p',
                    { style: { margin: 0, color: 'var(--text-secondary)' } },
                    'Revenue analytics remains available in this shared shell to avoid context switching across monetization journeys.'
                )
        )
    );

const MonetizationThemePacksRoutePage = () =>
    createElement(
        MonetizationModuleShell,
        {
            active: 'themes',
            title: 'Theme bundles (BMC)',
            subtitle: 'Theme packs bound to theme catalog, previews, and appearance state.',
        },
        gatedMonetizationSlice(monetizationThemePacksGate, 'Theme bundles', () =>
            createElement(ThemesSlice)
        )
    );

export const monetizationOverviewRoutes: FeatureRoute[] = [
    { path: getMonetizationPath(), component: MonetizationOverviewRoutePage },
];

export const monetizationSubscriptionsRoutes: FeatureRoute[] = [
    {
        path: getMonetizationSubscriptionsPlansPath(),
        component: MonetizationSubscriptionsPlansRoutePage,
    },
];

export const monetizationBoostsRoutes: FeatureRoute[] = [
    { path: getMonetizationBoostsPath(), component: MonetizationBoostsRoutePage },
];

export const monetizationQuestsRoutes: FeatureRoute[] = [
    { path: getMonetizationQuestsPath(), component: MonetizationQuestsRoutePage },
];

export const monetizationMarketplaceRoutes: FeatureRoute[] = [
    { path: getMonetizationMarketplacePath(), component: MonetizationMarketplaceRoutePage },
];

export const monetizationAppMarketplaceRoutes: FeatureRoute[] = [
    { path: getMonetizationAppMarketplacePath(), component: MonetizationAppMarketplaceRoutePage },
];

export const monetizationPayoutsRevenueAnalyticsRoutes: FeatureRoute[] = [
    {
        path: getMonetizationPayoutsRevenueAnalyticsPath(),
        component: MonetizationPayoutsRevenueAnalyticsRoutePage,
    },
];

export const monetizationThemePacksRoutes: FeatureRoute[] = [
    { path: getMonetizationThemePacksPath(), component: MonetizationThemePacksRoutePage },
];

export const monetizationRoutes: FeatureRoute[] = [
    ...monetizationOverviewRoutes,
    ...monetizationSubscriptionsRoutes,
    ...monetizationBoostsRoutes,
    ...monetizationQuestsRoutes,
    ...monetizationMarketplaceRoutes,
    ...monetizationAppMarketplaceRoutes,
    ...monetizationPayoutsRevenueAnalyticsRoutes,
    ...monetizationThemePacksRoutes,
];
