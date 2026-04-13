/**
 * Feature allowlist used as the single registration source of truth.
 *
 * Additive migration rule:
 * - add IDs here first,
 * - then wire modules/plugins,
 * - then update CI/docs/tests.
 */
export const featureModuleManifest = ['governance', 'forum', 'deaddrop', 'moderation'] as const;

export type FeatureModuleId = typeof featureModuleManifest[number];

export const runtimePluginManifest = [
    'shell.legacy-layout',
    'theme.legacy-overrides',
    'composer.quick-actions',
    'navigation.space-hierarchy',
    'notifications.adapter',
    'right-panel.slots',
] as const;

export type RuntimePluginId = typeof runtimePluginManifest[number];

export const assertFeatureModuleIdAllowed = (featureId: string): void => {
    if (!featureModuleManifest.includes(featureId as FeatureModuleId)) {
        throw new Error(
            `[feature-manifest] Unknown feature module id "${featureId}". Add it to featureModuleManifest first.`
        );
    }
};

export const assertRuntimePluginIdAllowed = (pluginId: string): void => {
    if (!runtimePluginManifest.includes(pluginId as RuntimePluginId)) {
        throw new Error(
            `[feature-manifest] Unknown runtime plugin id "${pluginId}". Add it to runtimePluginManifest first.`
        );
    }
};
