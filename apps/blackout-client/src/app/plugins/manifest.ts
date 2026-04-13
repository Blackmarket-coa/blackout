import { defaultFeatureFlags } from '../core/features/featureFlags';
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
        id: 'composer.quick-actions',
        order: 10,
        enabled: defaultFeatureFlags.composerQuickActions,
    },
    {
        id: 'navigation.space-hierarchy',
        order: 20,
        enabled: defaultFeatureFlags.navigationSpaceHierarchy,
    },
    {
        id: 'notifications.adapter',
        order: 30,
        enabled: defaultFeatureFlags.notificationsAdapter,
    },
    {
        id: 'right-panel.slots',
        order: 40,
        enabled: defaultFeatureFlags.rightPanelPlugins,
    },
];

runtimePluginEntries.forEach((plugin) => assertRuntimePluginIdAllowed(plugin.id));

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
