import type { RuntimePluginId } from './manifest';

export type FeatureFlags = {
    governance: boolean;
    forum: boolean;
    deaddrop: boolean;
    steganography: boolean;
    moderation: boolean;
    logistics: boolean;
    legacyShellLayout: boolean;
    legacyThemeOverrides: boolean;
    legacyRoomSurfaceLayout: boolean;
    composerQuickActions: boolean;
    navigationSpaceHierarchy: boolean;
    notificationsAdapter: boolean;
    rightPanelPlugins: boolean;
};

export type FeatureMode = 'default' | 'baseline' | 'full';

export const defaultFeatureFlags: FeatureFlags = {
    governance: true,
    forum: true,
    deaddrop: true,
    steganography: false,
    moderation: false,
    logistics: false,
    legacyShellLayout: false,
    legacyThemeOverrides: false,
    legacyRoomSurfaceLayout: false,
    composerQuickActions: true,
    navigationSpaceHierarchy: true,
    notificationsAdapter: true,
    rightPanelPlugins: true,
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
};

const runtimePluginFlagKeys = Object.values(runtimePluginFeatureFlags);

const parseFeatureMode = (rawMode: string | undefined): FeatureMode => {
    if (!rawMode) return 'default';
    if (rawMode === 'baseline' || rawMode === 'full' || rawMode === 'default') return rawMode;
    return 'default';
};

export const resolveFeatureFlags = (
    env: Record<string, string | undefined> = {},
    baseFlags: FeatureFlags = defaultFeatureFlags
): FeatureFlags => {
    const mode = parseFeatureMode(env.BLACKOUT_FEATURE_MODE);

    if (mode === 'default') {
        return { ...baseFlags };
    }

    const nextFlags = { ...baseFlags };

    runtimePluginFlagKeys.forEach((flagName) => {
        nextFlags[flagName] = mode === 'full';
    });

    return nextFlags;
};

const runtimeEnv =
    typeof process !== 'undefined' && process.env
        ? (process.env as Record<string, string | undefined>)
        : {};

export const runtimeFeatureFlags = resolveFeatureFlags(runtimeEnv);
