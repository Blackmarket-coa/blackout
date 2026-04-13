import { runtimeFeatureFlags, runtimePluginFeatureFlags } from '../core/features/featureFlags';
import {
    assertRuntimePluginIdAllowed,
    runtimePluginManifest,
    type RuntimePluginId,
} from '../core/features/manifest';

export type RuntimePluginManifestEntry = {
    id: RuntimePluginId;
    order: number;
    enabled: boolean;
};

const runtimePluginEntries: RuntimePluginManifestEntry[] = [
    {
        id: 'shell.legacy-layout',
        order: 5,
        enabled: runtimeFeatureFlags.legacyShellLayout,
    },
    {
        id: 'theme.legacy-overrides',
        order: 8,
        enabled: runtimeFeatureFlags.legacyThemeOverrides,
    },
    {
        id: 'composer.quick-actions',
        order: 10,
        enabled: runtimeFeatureFlags.composerQuickActions,
    },
    {
        id: 'navigation.space-hierarchy',
        order: 20,
        enabled: runtimeFeatureFlags.navigationSpaceHierarchy,
    },
    {
        id: 'notifications.adapter',
        order: 30,
        enabled: runtimeFeatureFlags.notificationsAdapter,
    },
    {
        id: 'right-panel.slots',
        order: 40,
        enabled: runtimeFeatureFlags.rightPanelPlugins,
    },
];

runtimePluginEntries.forEach((plugin) => {
    assertRuntimePluginIdAllowed(plugin.id);

    const flagName = runtimePluginFeatureFlags[plugin.id];
    if (runtimeFeatureFlags[flagName] !== plugin.enabled) {
        throw new Error(
            `[feature-manifest] Runtime plugin "${plugin.id}" must derive enabled state from feature flag "${flagName}".`
        );
    }
});

const declaredIds = new Set(runtimePluginEntries.map((plugin) => plugin.id));
runtimePluginManifest.forEach((pluginId) => {
    if (!declaredIds.has(pluginId)) {
        throw new Error(
            `[feature-manifest] Runtime plugin "${pluginId}" is allowlisted but missing from src/app/plugins/manifest.ts.`
        );
    }
});

export const orderedRuntimePlugins = [...runtimePluginEntries].sort((a, b) => a.order - b.order);

export const isRuntimePluginEnabled = (pluginId: RuntimePluginId): boolean =>
    orderedRuntimePlugins.find((plugin) => plugin.id === pluginId)?.enabled ?? false;
