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
    'migration-hub',
    'profile',
    'home',
    'communities',
    'canopy',
    'plugins',
    'shell-destinations',
    'topics',
    'growth-referrals',
    'growth-ambassadors',
    'growth-quests',
    'market',
    'creators',
    'creators-storefront',
    'streams',
    'streaming',
    'events',
    'onboarding-creator',
    'creators-dashboard',
    'federation-self-host',
    'privacy-tools',
    'burner-identity',
    'panic',
    'mesh',
] as const;

export type FeatureModuleId = typeof featureModuleManifest[number];

/**
 * Feature-module plugin allowlist. Order in this manifest is canonical runtime order.
 */
export const featureModulePluginManifest = [
    'plugin.alpha',
    'plugin.beta',
    'plugin.monetization',
] as const;

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

/**
 * In-memory allowlist for ids contributed by marketplace-installed plugins
 * at runtime. Static feature-module / plugin ids must still appear in the
 * compile-time manifests above; this set only relaxes the assert for
 * dynamic plugins that come through `registerDynamicFeaturePlugin`.
 *
 * Insertion order is preserved so dynamic plugins sort deterministically
 * after the static `featureModulePluginManifest` entries.
 */
const runtimeModuleAllowlist = new Map<string, number>();
let runtimeModuleAllowlistNextIndex = 0;

export const addRuntimeModuleAllowedId = (id: string): void => {
    if (!runtimeModuleAllowlist.has(id)) {
        runtimeModuleAllowlist.set(id, runtimeModuleAllowlistNextIndex);
        runtimeModuleAllowlistNextIndex += 1;
    }
};

export const removeRuntimeModuleAllowedId = (id: string): void => {
    runtimeModuleAllowlist.delete(id);
};

export const isRuntimeModuleAllowedId = (id: string): boolean => runtimeModuleAllowlist.has(id);

export const _resetRuntimeModuleAllowlistForTest = (): void => {
    runtimeModuleAllowlist.clear();
    runtimeModuleAllowlistNextIndex = 0;
};

export const assertFeatureModuleIdAllowed = (featureId: string): void => {
    if (
        !featureModuleManifest.includes(featureId as FeatureModuleId) &&
        !runtimeModuleAllowlist.has(featureId)
    ) {
        throw new Error(
            `[feature-manifest] Unknown feature module id "${featureId}". Add it to featureModuleManifest first.`
        );
    }
};

export const assertFeatureModulePluginIdAllowed = (pluginId: string): void => {
    if (
        !featureModulePluginManifest.includes(pluginId as FeatureModulePluginId) &&
        !runtimeModuleAllowlist.has(pluginId)
    ) {
        throw new Error(
            `[feature-manifest] Unknown feature module plugin id "${pluginId}". Add it to featureModulePluginManifest first.`
        );
    }
};

export const getFeatureModulePluginOrder = (pluginId: string): number => {
    assertFeatureModulePluginIdAllowed(pluginId);
    const staticIndex = featureModulePluginManifest.indexOf(pluginId as FeatureModulePluginId);
    if (staticIndex !== -1) return staticIndex;
    const dynamicIndex = runtimeModuleAllowlist.get(pluginId);
    return featureModulePluginManifest.length + (dynamicIndex ?? 0);
};

export const assertRuntimePluginIdAllowed = (pluginId: string): void => {
    if (!runtimePluginManifest.includes(pluginId as RuntimePluginId)) {
        throw new Error(
            `[feature-manifest] Unknown runtime plugin id "${pluginId}". Add it to runtimePluginManifest first.`
        );
    }
};
