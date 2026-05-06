import type { RuntimePluginId } from './manifest';

export type FeatureFlags = {
    governance: boolean;
    forum: boolean;
    deaddrop: boolean;
    deadman: boolean;
    steganography: boolean;
    moderation: boolean;
    monetization: boolean;
    monetizationSubscriptions: boolean;
    monetizationBoosts: boolean;
    monetizationMarketplace: boolean;
    monetizationApps: boolean;
    monetizationThemes: boolean;
    monetizationQuests: boolean;
    monetizationPayouts: boolean;
    monetizationAnalytics: boolean;
    monetizationPayoutAnalytics: boolean;
    monetizationSuite: boolean;
    platformOps: boolean;
    notificationsPresence: boolean;
    mediaCall: boolean;
    stegoToolkit: boolean;
    settingsParity: boolean;
    federatedOps: boolean;
    authThreads: boolean;
    education: boolean;
    logistics: boolean;
    legacyShellLayout: boolean;
    legacyThemeOverrides: boolean;
    legacyRoomSurfaceLayout: boolean;
    composerQuickActions: boolean;
    navigationSpaceHierarchy: boolean;
    notificationsAdapter: boolean;
    rightPanelPlugins: boolean;
    liveInteractionBundle: boolean;
    coalition: boolean;
    coliseum: boolean;
    profile: boolean;
    home: boolean;
    communities: boolean;
    plugins: boolean;
    /**
     * AppShell mode-routing flag. When enabled, every destination renders
     * inside the AppShell wrapper (bottom-tab bar + mode-aware top bar +
     * dynamic right panel) and the canonical canopy/den path
     * `/communities/:canopyId/dens/:denId` becomes the room target.
     * Default off so the rollout is reversible without code revert.
     */
    shellAppShell: boolean;
    /**
     * HomeFeed surface flag. When enabled together with `shellAppShell`,
     * the `/` route mounts a chronological merge of the user's joined
     * dens instead of the legacy `ClientLayout`. Topic chips and the
     * `/topics/:tag` deep links are gated by this flag too. Default off.
     *
     * Routing matrix (PR 2):
     *   shellAppShell=off, discoveryHomeFeed=*    → `/` mounts ClientLayout
     *   shellAppShell=on,  discoveryHomeFeed=off  → `/` mounts ClientLayout
     *   shellAppShell=on,  discoveryHomeFeed=on   → `/` mounts HomeFeed
     */
    discoveryHomeFeed: boolean;
    /**
     * Topics surface flag. Owns the `/topics` and `/topics/:tag` routes
     * and the topic-chip widget that renders inside HomeFeed. Default
     * off; ships behind `discoveryHomeFeed` in PR 2 but exposed as a
     * separate flag so future reorganization (Phase 4 Meilisearch swap)
     * can toggle independently.
     */
    topics: boolean;
    /**
     * Market destination tab flag. When on, the existing
     * `MarketplaceSlice` is mounted as a top-level destination at
     * `/market` (and the AppShell bottom-tab "Market" entry resolves
     * to a real route instead of a placeholder). Independent of the
     * legacy `monetizationMarketplace` flag, which still gates the
     * underlying buyer surface from PR 1.
     */
    marketTab: boolean;
    /**
     * Product-attachment surface flag. Owns the `co.bmc.product_attachments`
     * Matrix custom-event renderer + attach dialog used to bind FBM
     * listings onto messages, canopy state, and stream descriptions.
     */
    productsAttachments: boolean;
    /**
     * Creator listing-management flag. Owns the
     * `/creator/listings` page that lets a creator publish, list, and
     * archive FBM listings via the existing `routes/creator.ts` API.
     */
    creatorsListings: boolean;
};

export type FeatureMode = 'default' | 'baseline' | 'full';

export const defaultFeatureFlags: FeatureFlags = {
    governance: true,
    forum: true,
    deaddrop: true,
    deadman: true,
    steganography: true,
    moderation: false,
    monetization: false,
    monetizationSubscriptions: false,
    monetizationBoosts: false,
    monetizationMarketplace: false,
    monetizationApps: false,
    monetizationThemes: false,
    monetizationQuests: false,
    monetizationPayouts: false,
    monetizationAnalytics: false,
    monetizationPayoutAnalytics: false,
    monetizationSuite: false,
    platformOps: false,
    notificationsPresence: false,
    mediaCall: false,
    stegoToolkit: false,
    settingsParity: false,
    federatedOps: false,
    authThreads: false,
    education: false,
    logistics: false,
    legacyShellLayout: false,
    legacyThemeOverrides: false,
    legacyRoomSurfaceLayout: false,
    composerQuickActions: true,
    navigationSpaceHierarchy: true,
    notificationsAdapter: true,
    rightPanelPlugins: true,
    liveInteractionBundle: true,
    coalition: true,
    coliseum: true,
    profile: true,
    home: true,
    communities: true,
    plugins: true,
    shellAppShell: false,
    discoveryHomeFeed: false,
    topics: false,
    marketTab: false,
    productsAttachments: false,
    creatorsListings: false,
};

/**
 * Minimal shell extension point: runtime plugin enablement is derived from typed
 * feature flags so migration stays additive and reversible.
 */
export const runtimePluginFeatureFlags: Record<RuntimePluginId, keyof FeatureFlags> = {
    'shell.legacy-layout': 'legacyShellLayout',
    'theme.legacy-overrides': 'legacyThemeOverrides',
    'composer.quick-actions': 'composerQuickActions',
    'navigation.space-hierarchy': 'navigationSpaceHierarchy',
    'notifications.adapter': 'notificationsAdapter',
    'right-panel.slots': 'rightPanelPlugins',
    'live-interaction.bundle': 'liveInteractionBundle',
};

const runtimePluginFlagKeys = Object.values(runtimePluginFeatureFlags);

const modeManagedRuntimePluginFlagKeys = runtimePluginFlagKeys.filter(
    (flagName) => flagName !== 'legacyShellLayout'
);

const parseFeatureMode = (rawMode: string | undefined): FeatureMode => {
    if (!rawMode) return 'default';
    if (rawMode === 'baseline' || rawMode === 'full' || rawMode === 'default') return rawMode;
    return 'default';
};

type MonetizationFlagKey =
    | 'monetization'
    | 'monetizationSubscriptions'
    | 'monetizationBoosts'
    | 'monetizationMarketplace'
    | 'monetizationApps'
    | 'monetizationThemes'
    | 'monetizationQuests'
    | 'monetizationPayouts'
    | 'monetizationAnalytics'
    | 'monetizationPayoutAnalytics'
    | 'monetizationSuite';

const monetizationFlagEnvMap: Record<MonetizationFlagKey, string> = {
    monetization: 'BLACKOUT_MONETIZATION',
    monetizationSubscriptions: 'BLACKOUT_MONETIZATION_SUBSCRIPTIONS',
    monetizationBoosts: 'BLACKOUT_MONETIZATION_BOOSTS',
    monetizationMarketplace: 'BLACKOUT_MONETIZATION_MARKETPLACE',
    monetizationApps: 'BLACKOUT_MONETIZATION_APPS',
    monetizationThemes: 'BLACKOUT_MONETIZATION_THEMES',
    monetizationQuests: 'BLACKOUT_MONETIZATION_QUESTS',
    monetizationPayouts: 'BLACKOUT_MONETIZATION_PAYOUTS',
    monetizationAnalytics: 'BLACKOUT_MONETIZATION_ANALYTICS',
    monetizationPayoutAnalytics: 'BLACKOUT_MONETIZATION_PAYOUT_ANALYTICS',
    monetizationSuite: 'BLACKOUT_MONETIZATION_SUITE',
};

const monetizationSliceFlags: MonetizationFlagKey[] = [
    'monetizationSubscriptions',
    'monetizationBoosts',
    'monetizationMarketplace',
    'monetizationApps',
    'monetizationThemes',
    'monetizationQuests',
    'monetizationPayoutAnalytics',
];

const parseBooleanFlag = (raw: string | undefined): boolean | undefined => {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return undefined;
};

const applyMonetizationEnvOverrides = (
    env: Record<string, string | undefined>,
    flags: FeatureFlags
): void => {
    (Object.keys(monetizationFlagEnvMap) as MonetizationFlagKey[]).forEach((flagName) => {
        const parsed = parseBooleanFlag(env[monetizationFlagEnvMap[flagName]]);
        if (parsed !== undefined) {
            flags[flagName] = parsed;
        }
    });
};

const validateMonetizationSkuDependencies = (flags: FeatureFlags): void => {
    if (flags.monetizationSuite) {
        flags.monetization = true;
        monetizationSliceFlags.forEach((flagName) => {
            flags[flagName] = true;
        });
    }

    if (flags.monetizationPayoutAnalytics) {
        flags.monetizationPayouts = true;
        flags.monetizationAnalytics = true;
    }

    const hasEnabledSlice = monetizationSliceFlags.some((flagName) => flags[flagName]);

    if (flags.monetization && hasEnabledSlice) {
        return;
    }

    if (!flags.monetization) {
        flags.monetizationSuite = false;
        monetizationSliceFlags.forEach((flagName) => {
            flags[flagName] = false;
        });
        flags.monetizationPayouts = false;
        flags.monetizationAnalytics = false;
    }
};

export const resolveFeatureFlags = (
    env: Record<string, string | undefined> = {},
    baseFlags: FeatureFlags = defaultFeatureFlags
): FeatureFlags => {
    const mode = parseFeatureMode(env.BLACKOUT_FEATURE_MODE);

    if (mode === 'default') {
        const nextFlags = { ...baseFlags };
        applyMonetizationEnvOverrides(env, nextFlags);
        validateMonetizationSkuDependencies(nextFlags);
        if (env.BLACKOUT_LEGACY_SHELL_FALLBACK === 'true') {
            nextFlags.legacyShellLayout = true;
        }
        if (env.BLACKOUT_LIVE_INTERACTION_BUNDLE === 'true') {
            nextFlags.liveInteractionBundle = true;
        }
        if (env.BLACKOUT_LIVE_INTERACTION_BUNDLE === 'false') {
            nextFlags.liveInteractionBundle = false;
        }
        if (env.BLACKOUT_PLATFORM_OPS === 'true') {
            nextFlags.platformOps = true;
        }
        if (env.BLACKOUT_PLATFORM_OPS === 'false') {
            nextFlags.platformOps = false;
        }
        if (env.BLACKOUT_NOTIFICATIONS_PRESENCE === 'true') {
            nextFlags.notificationsPresence = true;
        }
        if (env.BLACKOUT_NOTIFICATIONS_PRESENCE === 'false') {
            nextFlags.notificationsPresence = false;
        }
        if (env.BLACKOUT_MEDIA_CALL === 'true') {
            nextFlags.mediaCall = true;
        }
        if (env.BLACKOUT_MEDIA_CALL === 'false') {
            nextFlags.mediaCall = false;
        }
        if (env.BLACKOUT_STEGO_TOOLKIT === 'true') {
            nextFlags.stegoToolkit = true;
        }
        if (env.BLACKOUT_STEGO_TOOLKIT === 'false') {
            nextFlags.stegoToolkit = false;
        }
        if (env.BLACKOUT_SETTINGS_PARITY === 'true') {
            nextFlags.settingsParity = true;
        }
        if (env.BLACKOUT_SETTINGS_PARITY === 'false') {
            nextFlags.settingsParity = false;
        }
        if (env.BLACKOUT_FEDERATED_OPS === 'true') {
            nextFlags.federatedOps = true;
        }
        if (env.BLACKOUT_FEDERATED_OPS === 'false') {
            nextFlags.federatedOps = false;
        }
        if (env.BLACKOUT_AUTH_THREADS === 'true') {
            nextFlags.authThreads = true;
        }
        if (env.BLACKOUT_AUTH_THREADS === 'false') {
            nextFlags.authThreads = false;
        }
        if (env.BLACKOUT_EDUCATION === 'true') {
            nextFlags.education = true;
        }
        if (env.BLACKOUT_EDUCATION === 'false') {
            nextFlags.education = false;
        }
        if (env.BLACKOUT_COALITION === 'true') {
            nextFlags.coalition = true;
        }
        if (env.BLACKOUT_COALITION === 'false') {
            nextFlags.coalition = false;
        }
        if (env.BLACKOUT_COLISEUM === 'true') {
            nextFlags.coliseum = true;
        }
        if (env.BLACKOUT_COLISEUM === 'false') {
            nextFlags.coliseum = false;
        }
        if (env.BLACKOUT_PROFILE === 'true') {
            nextFlags.profile = true;
        }
        if (env.BLACKOUT_PROFILE === 'false') {
            nextFlags.profile = false;
        }
        if (env.BLACKOUT_DEADMAN === 'true') {
            nextFlags.deadman = true;
        }
        if (env.BLACKOUT_DEADMAN === 'false') {
            nextFlags.deadman = false;
        }
        if (env.BLACKOUT_HOME === 'true') {
            nextFlags.home = true;
        }
        if (env.BLACKOUT_HOME === 'false') {
            nextFlags.home = false;
        }
        if (env.BLACKOUT_COMMUNITIES === 'true') {
            nextFlags.communities = true;
        }
        if (env.BLACKOUT_COMMUNITIES === 'false') {
            nextFlags.communities = false;
        }
        if (env.BLACKOUT_PLUGINS === 'true') {
            nextFlags.plugins = true;
        }
        if (env.BLACKOUT_PLUGINS === 'false') {
            nextFlags.plugins = false;
        }
        if (env.BLACKOUT_SHELL_APP_SHELL === 'true') {
            nextFlags.shellAppShell = true;
        }
        if (env.BLACKOUT_SHELL_APP_SHELL === 'false') {
            nextFlags.shellAppShell = false;
        }
        if (env.BLACKOUT_DISCOVERY_HOME_FEED === 'true') {
            nextFlags.discoveryHomeFeed = true;
        }
        if (env.BLACKOUT_DISCOVERY_HOME_FEED === 'false') {
            nextFlags.discoveryHomeFeed = false;
        }
        if (env.BLACKOUT_TOPICS === 'true') {
            nextFlags.topics = true;
        }
        if (env.BLACKOUT_TOPICS === 'false') {
            nextFlags.topics = false;
        }
        if (env.BLACKOUT_MARKET_TAB === 'true') {
            nextFlags.marketTab = true;
        }
        if (env.BLACKOUT_MARKET_TAB === 'false') {
            nextFlags.marketTab = false;
        }
        if (env.BLACKOUT_PRODUCTS_ATTACHMENTS === 'true') {
            nextFlags.productsAttachments = true;
        }
        if (env.BLACKOUT_PRODUCTS_ATTACHMENTS === 'false') {
            nextFlags.productsAttachments = false;
        }
        if (env.BLACKOUT_CREATORS_LISTINGS === 'true') {
            nextFlags.creatorsListings = true;
        }
        if (env.BLACKOUT_CREATORS_LISTINGS === 'false') {
            nextFlags.creatorsListings = false;
        }
        return nextFlags;
    }

    const nextFlags = { ...baseFlags };

    modeManagedRuntimePluginFlagKeys.forEach((flagName) => {
        nextFlags[flagName] = mode === 'full';
    });

    if (env.BLACKOUT_LEGACY_SHELL_FALLBACK === 'true') {
        nextFlags.legacyShellLayout = true;
    }
    if (env.BLACKOUT_LIVE_INTERACTION_BUNDLE === 'true') {
        nextFlags.liveInteractionBundle = true;
    }
    if (env.BLACKOUT_LIVE_INTERACTION_BUNDLE === 'false') {
        nextFlags.liveInteractionBundle = false;
    }
    if (env.BLACKOUT_PLATFORM_OPS === 'true') {
        nextFlags.platformOps = true;
    }
    if (env.BLACKOUT_PLATFORM_OPS === 'false') {
        nextFlags.platformOps = false;
    }
    if (env.BLACKOUT_NOTIFICATIONS_PRESENCE === 'true') {
        nextFlags.notificationsPresence = true;
    }
    if (env.BLACKOUT_NOTIFICATIONS_PRESENCE === 'false') {
        nextFlags.notificationsPresence = false;
    }
    if (env.BLACKOUT_MEDIA_CALL === 'true') {
        nextFlags.mediaCall = true;
    }
    if (env.BLACKOUT_MEDIA_CALL === 'false') {
        nextFlags.mediaCall = false;
    }
    if (env.BLACKOUT_STEGO_TOOLKIT === 'true') {
        nextFlags.stegoToolkit = true;
    }
    if (env.BLACKOUT_STEGO_TOOLKIT === 'false') {
        nextFlags.stegoToolkit = false;
    }
    if (env.BLACKOUT_SETTINGS_PARITY === 'true') {
        nextFlags.settingsParity = true;
    }
    if (env.BLACKOUT_SETTINGS_PARITY === 'false') {
        nextFlags.settingsParity = false;
    }
    if (env.BLACKOUT_FEDERATED_OPS === 'true') {
        nextFlags.federatedOps = true;
    }
    if (env.BLACKOUT_FEDERATED_OPS === 'false') {
        nextFlags.federatedOps = false;
    }
    if (env.BLACKOUT_AUTH_THREADS === 'true') {
        nextFlags.authThreads = true;
    }
    if (env.BLACKOUT_AUTH_THREADS === 'false') {
        nextFlags.authThreads = false;
    }
    if (env.BLACKOUT_EDUCATION === 'true') {
        nextFlags.education = true;
    }
    if (env.BLACKOUT_EDUCATION === 'false') {
        nextFlags.education = false;
    }
    if (env.BLACKOUT_COALITION === 'true') {
        nextFlags.coalition = true;
    }
    if (env.BLACKOUT_COALITION === 'false') {
        nextFlags.coalition = false;
    }
    if (env.BLACKOUT_COLISEUM === 'true') {
        nextFlags.coliseum = true;
    }
    if (env.BLACKOUT_COLISEUM === 'false') {
        nextFlags.coliseum = false;
    }
    if (env.BLACKOUT_PROFILE === 'true') {
        nextFlags.profile = true;
    }
    if (env.BLACKOUT_PROFILE === 'false') {
        nextFlags.profile = false;
    }
    if (env.BLACKOUT_DEADMAN === 'true') {
        nextFlags.deadman = true;
    }
    if (env.BLACKOUT_DEADMAN === 'false') {
        nextFlags.deadman = false;
    }
    if (env.BLACKOUT_HOME === 'true') {
        nextFlags.home = true;
    }
    if (env.BLACKOUT_HOME === 'false') {
        nextFlags.home = false;
    }
    if (env.BLACKOUT_COMMUNITIES === 'true') {
        nextFlags.communities = true;
    }
    if (env.BLACKOUT_COMMUNITIES === 'false') {
        nextFlags.communities = false;
    }
    if (env.BLACKOUT_PLUGINS === 'true') {
        nextFlags.plugins = true;
    }
    if (env.BLACKOUT_PLUGINS === 'false') {
        nextFlags.plugins = false;
    }
    if (env.BLACKOUT_SHELL_APP_SHELL === 'true') {
        nextFlags.shellAppShell = true;
    }
    if (env.BLACKOUT_SHELL_APP_SHELL === 'false') {
        nextFlags.shellAppShell = false;
    }
    if (env.BLACKOUT_DISCOVERY_HOME_FEED === 'true') {
        nextFlags.discoveryHomeFeed = true;
    }
    if (env.BLACKOUT_DISCOVERY_HOME_FEED === 'false') {
        nextFlags.discoveryHomeFeed = false;
    }
    if (env.BLACKOUT_TOPICS === 'true') {
        nextFlags.topics = true;
    }
    if (env.BLACKOUT_TOPICS === 'false') {
        nextFlags.topics = false;
    }
    if (env.BLACKOUT_MARKET_TAB === 'true') {
        nextFlags.marketTab = true;
    }
    if (env.BLACKOUT_MARKET_TAB === 'false') {
        nextFlags.marketTab = false;
    }
    if (env.BLACKOUT_PRODUCTS_ATTACHMENTS === 'true') {
        nextFlags.productsAttachments = true;
    }
    if (env.BLACKOUT_PRODUCTS_ATTACHMENTS === 'false') {
        nextFlags.productsAttachments = false;
    }
    if (env.BLACKOUT_CREATORS_LISTINGS === 'true') {
        nextFlags.creatorsListings = true;
    }
    if (env.BLACKOUT_CREATORS_LISTINGS === 'false') {
        nextFlags.creatorsListings = false;
    }

    applyMonetizationEnvOverrides(env, nextFlags);
    validateMonetizationSkuDependencies(nextFlags);

    return nextFlags;
};

const runtimeEnv =
    typeof process !== 'undefined' && process.env
        ? (process.env as Record<string, string | undefined>)
        : {};

export const runtimeFeatureFlags = resolveFeatureFlags(runtimeEnv);
