/**
 * Feature allowlist used as the single registration source of truth.
 *
 * Additive migration rule:
 * - add IDs here first,
 * - then wire modules/plugins,
 * - then update CI/docs/tests.
 */
export const featureModuleManifest = [
    'governance',
    'forum',
    'deaddrop',
    'deadman',
    'moderation',
    'monetization',
    'platform-ops',
    'notifications-presence',
    'media-call',
    'stego-toolkit',
    'settings-parity',
    'federated-ops',
    'auth-threads',
    'education',
    'coalition',
    'coliseum',
    'profile',
    'home',
    'communities',
    'plugins',
] as const;

export type FeatureModuleId = typeof featureModuleManifest[number];

/**
 * Feature-module plugin allowlist. Order in this manifest is canonical runtime order.
 */
export const featureModulePluginManifest = ['plugin.alpha', 'plugin.beta', 'plugin.monetization'] as const;

export type FeatureModulePluginId = typeof featureModulePluginManifest[number];

export const runtimePluginManifest = [
    'shell.legacy-layout',
    'theme.legacy-overrides',
    'composer.quick-actions',
    'navigation.space-hierarchy',
    'notifications.adapter',
    'right-panel.slots',
    'live-interaction.bundle',
] as const;

export type RuntimePluginId = typeof runtimePluginManifest[number];

export const assertFeatureModuleIdAllowed = (featureId: string): void => {
    if (!featureModuleManifest.includes(featureId as FeatureModuleId)) {
        throw new Error(
            `[feature-manifest] Unknown feature module id "${featureId}". Add it to featureModuleManifest first.`
        );
    }
};

export const assertFeatureModulePluginIdAllowed = (pluginId: string): void => {
    if (!featureModulePluginManifest.includes(pluginId as FeatureModulePluginId)) {
        throw new Error(
            `[feature-manifest] Unknown feature module plugin id "${pluginId}". Add it to featureModulePluginManifest first.`
        );
    }
};

export const getFeatureModulePluginOrder = (pluginId: string): number => {
    assertFeatureModulePluginIdAllowed(pluginId);
    return featureModulePluginManifest.indexOf(pluginId as FeatureModulePluginId);
};

export const assertRuntimePluginIdAllowed = (pluginId: string): void => {
    if (!runtimePluginManifest.includes(pluginId as RuntimePluginId)) {
        throw new Error(
            `[feature-manifest] Unknown runtime plugin id "${pluginId}". Add it to runtimePluginManifest first.`
        );
    }
};
