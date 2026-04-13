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
