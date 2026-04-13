import {
    type FeatureFlags,
    runtimeFeatureFlags,
    runtimePluginFeatureFlags,
} from '../core/features/featureFlags';
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

type RuntimePluginManifestSeedEntry = Omit<RuntimePluginManifestEntry, 'enabled'> & {
    flag: keyof FeatureFlags;
};

const runtimePluginSeedEntries: RuntimePluginManifestSeedEntry[] = [
    { id: 'shell.legacy-layout', order: 5, flag: 'legacyShellLayout' },
    { id: 'theme.legacy-overrides', order: 8, flag: 'legacyThemeOverrides' },
    { id: 'composer.quick-actions', order: 10, flag: 'composerQuickActions' },
    { id: 'navigation.space-hierarchy', order: 20, flag: 'navigationSpaceHierarchy' },
    { id: 'notifications.adapter', order: 30, flag: 'notificationsAdapter' },
    { id: 'right-panel.slots', order: 40, flag: 'rightPanelPlugins' },
];

export const buildRuntimePluginManifest = (
    flags: FeatureFlags = runtimeFeatureFlags
): RuntimePluginManifestEntry[] =>
    runtimePluginSeedEntries.map(({ id, order, flag }) => ({
        id,
        order,
        enabled: flags[flag],
    }));

const runtimePluginEntries = buildRuntimePluginManifest(runtimeFeatureFlags);

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

export const isRuntimePluginEnabled = (pluginId: string): boolean => {
    assertRuntimePluginIdAllowed(pluginId);
    return (
        orderedRuntimePlugins.find((plugin) => plugin.id === (pluginId as RuntimePluginId))
            ?.enabled ?? false
    );
};
