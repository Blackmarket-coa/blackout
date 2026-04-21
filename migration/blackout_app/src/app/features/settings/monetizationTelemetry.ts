import type { SettingsSectionId } from './settingsAtoms';

export type MonetizationSectionId = Extract<
    SettingsSectionId,
    | 'monetization-plan'
    | 'monetization-billing'
    | 'monetization-boost'
    | 'monetization-marketplace'
    | 'monetization-theme-packs'
>;

export type MonetizationRouteTitle =
    | 'plan_trial'
    | 'billing_checkout'
    | 'boost_preferences'
    | 'marketplace_controls'
    | 'theme_bundle_catalog';

export type MonetizationFeatureId =
    | 'premium_plan'
    | 'checkout'
    | 'boost'
    | 'marketplace'
    | 'theme_bundle';

export type MonetizationAccessLevel = 'public' | 'member' | 'premium' | 'seller';

export interface MonetizationRouteMetadata {
    title: MonetizationRouteTitle;
    sectionId: MonetizationSectionId;
    featureId: MonetizationFeatureId;
    accessLevel: MonetizationAccessLevel;
}

export const monetizationRouteMetadataBySection: Record<
    MonetizationSectionId,
    MonetizationRouteMetadata
> = {
    'monetization-plan': {
        title: 'plan_trial',
        sectionId: 'monetization-plan',
        featureId: 'premium_plan',
        accessLevel: 'member',
    },
    'monetization-billing': {
        title: 'billing_checkout',
        sectionId: 'monetization-billing',
        featureId: 'checkout',
        accessLevel: 'member',
    },
    'monetization-boost': {
        title: 'boost_preferences',
        sectionId: 'monetization-boost',
        featureId: 'boost',
        accessLevel: 'member',
    },
    'monetization-marketplace': {
        title: 'marketplace_controls',
        sectionId: 'monetization-marketplace',
        featureId: 'marketplace',
        accessLevel: 'seller',
    },
    'monetization-theme-packs': {
        title: 'theme_bundle_catalog',
        sectionId: 'monetization-theme-packs',
        featureId: 'theme_bundle',
        accessLevel: 'premium',
    },
};

export type MonetizationQuestState = 'locked' | 'available' | 'in_progress' | 'completed' | 'expired';

export type MonetizationTelemetryEvent =
    | {
          name: 'monetization_plan_view' | 'monetization_plan_open';
          route: MonetizationRouteMetadata;
      }
    | {
          name: 'monetization_upgrade_intent';
          route: MonetizationRouteMetadata;
          targetFeatureId: MonetizationFeatureId;
      }
    | {
          name: 'monetization_checkout_open' | 'monetization_checkout_close';
          route: MonetizationRouteMetadata;
          checkoutSurface: 'settings' | 'upsell' | 'marketplace';
      }
    | {
          name: 'monetization_trial_start' | 'monetization_trial_expire';
          route: MonetizationRouteMetadata;
          trialType: 'free' | 'partner' | 'promo';
      }
    | {
          name: 'monetization_quest_state_transition';
          route: MonetizationRouteMetadata;
          previousState: MonetizationQuestState;
          nextState: MonetizationQuestState;
      }
    | {
          name: 'monetization_marketplace_listing_view' | 'monetization_marketplace_open';
          route: MonetizationRouteMetadata;
          listingScope: 'featured' | 'owned' | 'search';
      }
    | {
          name: 'monetization_theme_bundle_catalog_view' | 'monetization_theme_bundle_open';
          route: MonetizationRouteMetadata;
          bundleScope: 'featured' | 'owned' | 'seasonal';
      };

const ALLOWED_ROUTE_TITLES = new Set<MonetizationRouteTitle>([
    'plan_trial',
    'billing_checkout',
    'boost_preferences',
    'marketplace_controls',
    'theme_bundle_catalog',
]);

const ALLOWED_FEATURE_IDS = new Set<MonetizationFeatureId>([
    'premium_plan',
    'checkout',
    'boost',
    'marketplace',
    'theme_bundle',
]);

const ALLOWED_ACCESS_LEVELS = new Set<MonetizationAccessLevel>(['public', 'member', 'premium', 'seller']);

const ALLOWED_SECTION_IDS = new Set<MonetizationSectionId>([
    'monetization-plan',
    'monetization-billing',
    'monetization-boost',
    'monetization-marketplace',
    'monetization-theme-packs',
]);

const isMonetizationRouteMetadata = (value: unknown): value is MonetizationRouteMetadata => {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const route = value as Partial<MonetizationRouteMetadata>;

    return (
        typeof route.title === 'string' &&
        ALLOWED_ROUTE_TITLES.has(route.title as MonetizationRouteTitle) &&
        typeof route.sectionId === 'string' &&
        ALLOWED_SECTION_IDS.has(route.sectionId as MonetizationSectionId) &&
        typeof route.featureId === 'string' &&
        ALLOWED_FEATURE_IDS.has(route.featureId as MonetizationFeatureId) &&
        typeof route.accessLevel === 'string' &&
        ALLOWED_ACCESS_LEVELS.has(route.accessLevel as MonetizationAccessLevel)
    );
};

const containsPlaintextLeak = (value: unknown): boolean => {
    if (typeof value === 'string') {
        return /\s/.test(value) || value.length > 64;
    }

    if (Array.isArray(value)) {
        return value.some((item) => containsPlaintextLeak(item));
    }

    if (value && typeof value === 'object') {
        return Object.values(value as Record<string, unknown>).some((item) => containsPlaintextLeak(item));
    }

    return false;
};

export const isValidMonetizationTelemetryEvent = (
    event: unknown,
): event is MonetizationTelemetryEvent => {
    if (!event || typeof event !== 'object') {
        return false;
    }

    const candidate = event as Partial<MonetizationTelemetryEvent> & { route?: unknown };
    if (typeof candidate.name !== 'string' || !isMonetizationRouteMetadata(candidate.route)) {
        return false;
    }

    switch (candidate.name) {
        case 'monetization_plan_view':
        case 'monetization_plan_open':
            return true;
        case 'monetization_upgrade_intent':
            return (
                typeof candidate.targetFeatureId === 'string' &&
                ALLOWED_FEATURE_IDS.has(candidate.targetFeatureId as MonetizationFeatureId)
            );
        case 'monetization_checkout_open':
        case 'monetization_checkout_close':
            return (
                candidate.checkoutSurface === 'settings' ||
                candidate.checkoutSurface === 'upsell' ||
                candidate.checkoutSurface === 'marketplace'
            );
        case 'monetization_trial_start':
        case 'monetization_trial_expire':
            return (
                candidate.trialType === 'free' ||
                candidate.trialType === 'partner' ||
                candidate.trialType === 'promo'
            );
        case 'monetization_quest_state_transition':
            return (
                (candidate.previousState === 'locked' ||
                    candidate.previousState === 'available' ||
                    candidate.previousState === 'in_progress' ||
                    candidate.previousState === 'completed' ||
                    candidate.previousState === 'expired') &&
                (candidate.nextState === 'locked' ||
                    candidate.nextState === 'available' ||
                    candidate.nextState === 'in_progress' ||
                    candidate.nextState === 'completed' ||
                    candidate.nextState === 'expired')
            );
        case 'monetization_marketplace_listing_view':
        case 'monetization_marketplace_open':
            return (
                candidate.listingScope === 'featured' ||
                candidate.listingScope === 'owned' ||
                candidate.listingScope === 'search'
            );
        case 'monetization_theme_bundle_catalog_view':
        case 'monetization_theme_bundle_open':
            return (
                candidate.bundleScope === 'featured' ||
                candidate.bundleScope === 'owned' ||
                candidate.bundleScope === 'seasonal'
            );
        default:
            return false;
    }
};

export const toSafeMonetizationTelemetryEvent = (
    event: MonetizationTelemetryEvent,
): MonetizationTelemetryEvent | null => {
    if (!isValidMonetizationTelemetryEvent(event)) {
        return null;
    }

    if (containsPlaintextLeak(event)) {
        return null;
    }

    return event;
};

export const getMonetizationRouteMetadata = (
    sectionId: MonetizationSectionId,
): MonetizationRouteMetadata => monetizationRouteMetadataBySection[sectionId];
