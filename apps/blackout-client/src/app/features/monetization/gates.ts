import type { CapabilityGate } from '../../core/features/types';

export const monetizationCapabilityCatalog = [
    'billing.read',
    'billing.write',
    'marketplace.read',
    'payouts.read',
    'themes.commerce',
    'monetization.subscriptions',
    'monetization.boosts',
    'monetization.marketplace',
    'monetization.quests',
    'monetization.payouts',
    'monetization.analytics',
] as const;

export const monetizationOverviewGate: CapabilityGate = {
    allOf: ['billing.read'],
    flags: ['monetization'],
};

export const monetizationSubscriptionsGate: CapabilityGate = {
    allOf: ['billing.read'],
    flags: ['monetization', 'monetizationSubscriptions'],
};

export const monetizationBoostsGate: CapabilityGate = {
    allOf: ['billing.write'],
    flags: ['monetization', 'monetizationBoosts'],
};

export const monetizationQuestsGate: CapabilityGate = {
    allOf: ['billing.read'],
    flags: ['monetization', 'monetizationQuests'],
};

export const monetizationMarketplaceGate: CapabilityGate = {
    allOf: ['marketplace.read'],
    flags: ['monetization', 'monetizationMarketplace'],
};

export const monetizationPayoutsAnalyticsGate: CapabilityGate = {
    allOf: ['payouts.read'],
    flags: ['monetization', 'monetizationPayouts', 'monetizationAnalytics'],
};

export const monetizationThemePacksGate: CapabilityGate = {
    allOf: ['themes.commerce'],
    flags: ['monetization', 'monetizationMarketplace'],
};
