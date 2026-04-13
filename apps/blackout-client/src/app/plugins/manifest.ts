import { defaultFeatureFlags } from '../core/features/featureFlags';

export type RuntimePluginId = 'composer.quick-actions' | 'navigation.space-hierarchy';

export type RuntimePluginManifestEntry = {
    id: RuntimePluginId;
    order: number;
    enabled: boolean;
};

const runtimePluginManifest: RuntimePluginManifestEntry[] = [
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
];

export const orderedRuntimePlugins = [...runtimePluginManifest].sort((a, b) => a.order - b.order);

export const isRuntimePluginEnabled = (pluginId: RuntimePluginId): boolean =>
    orderedRuntimePlugins.find((plugin) => plugin.id === pluginId)?.enabled ?? false;
