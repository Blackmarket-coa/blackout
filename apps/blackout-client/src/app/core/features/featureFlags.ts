import type { RuntimePluginId } from './manifest';

export type FeatureFlags = {
    governance: boolean;
    forum: boolean;
    deaddrop: boolean;
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
    logistics: boolean;
    legacyShellLayout: boolean;
    legacyThemeOverrides: boolean;
    legacyRoomSurfaceLayout: boolean;
    composerQuickActions: boolean;
    navigationSpaceHierarchy: boolean;
    notificationsAdapter: boolean;
    rightPanelPlugins: boolean;
    liveInteractionBundle: boolean;
};

export type FeatureMode = 'default' | 'baseline' | 'full';

export const defaultFeatureFlags: FeatureFlags = {
    governance: true,
    forum: true,
    deaddrop: true,
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
    logistics: false,
    legacyShellLayout: false,
    legacyThemeOverrides: false,
    legacyRoomSurfaceLayout: false,
    composerQuickActions: true,
    navigationSpaceHierarchy: true,
    notificationsAdapter: true,
    rightPanelPlugins: true,
    liveInteractionBundle: true,
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

    applyMonetizationEnvOverrides(env, nextFlags);
    validateMonetizationSkuDependencies(nextFlags);

    return nextFlags;
};

const runtimeEnv =
    typeof process !== 'undefined' && process.env
        ? (process.env as Record<string, string | undefined>)
        : {};

export const runtimeFeatureFlags = resolveFeatureFlags(runtimeEnv);
