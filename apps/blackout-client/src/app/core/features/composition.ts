import {
    getFeatureModulePluginOrder,
    type FeatureModuleId,
    type FeatureModulePluginId,
} from './manifest';
import { resolveFeatureCustomizations, type CapabilityGateContext } from './capabilityGate';
import type {
    BlackoutFeature,
    FeatureModule,
    FeatureModulePlugin,
    FeatureNavItem,
    FeatureRoute,
    FeatureSettingsItem,
    ShellPanelEntry,
    ShellPanelKind,
} from './types';

export const assertFeatureModulesRegistered = (
    modules: FeatureModule[],
    registeredFeatureModuleIds: readonly FeatureModuleId[],
    source: 'core' | 'plugin'
): void => {
    const allowed = new Set(registeredFeatureModuleIds);

    for (const module of modules) {
        if (!allowed.has(module.feature.id as FeatureModuleId)) {
            throw new Error(
                `[feature-registry] ${source} module "${module.feature.id}" is not registered in featureModuleManifest.`
            );
        }
    }
};

export const orderFeatureModulePlugins = (
    plugins: FeatureModulePlugin[]
): FeatureModulePlugin[] => {
    const seenPluginIds = new Set<string>();

    return [...plugins]
        .sort(
            (left, right) =>
                getFeatureModulePluginOrder(left.id as FeatureModulePluginId) -
                getFeatureModulePluginOrder(right.id as FeatureModulePluginId)
        )
        .map((plugin) => {
            if (seenPluginIds.has(plugin.id)) {
                throw new Error(
                    `[feature-registry] Duplicate feature module plugin id "${plugin.id}" detected.`
                );
            }
            seenPluginIds.add(plugin.id);
            return plugin;
        });
};

export const composeFeatureRoutes = (
    registry: BlackoutFeature[],
    context?: CapabilityGateContext
): FeatureRoute[] =>
    registry.flatMap((feature) =>
        resolveFeatureCustomizations(feature, context).flatMap(
            (customization) => customization.routes ?? []
        )
    );

export const composeFeatureNavItems = (
    registry: BlackoutFeature[],
    context?: CapabilityGateContext
): FeatureNavItem[] =>
    registry.flatMap((feature) =>
        resolveFeatureCustomizations(feature, context).flatMap(
            (customization) => customization.navItems ?? []
        )
    );

export const composeFeatureSettings = (
    registry: BlackoutFeature[],
    context?: CapabilityGateContext
): FeatureSettingsItem[] =>
    registry.flatMap((feature) =>
        resolveFeatureCustomizations(feature, context).flatMap(
            (customization) => customization.settings ?? []
        )
    );

/**
 * Aggregates shell-level panel contributions across the registry, applying
 * capability gating just like `composeFeatureNavItems`.
 *
 * Entries are returned sorted by `(kind, order, insertion)` so callers can
 * filter by `kind` without re-sorting.
 *
 * Foundation for BKL-001: workspace tabs / mobile tab bar / sidebar nav /
 * right-panel slots are all driven from feature manifests instead of
 * ad-hoc shell code, matching the parity-matrix `web.workspace.tabs`,
 * `web.mobile.tabs`, and `web.sidebar.nav` rows.
 */
export const composeShellPanels = (
    registry: BlackoutFeature[],
    context?: CapabilityGateContext
): ShellPanelEntry[] => {
    const indexed = registry.flatMap((feature, featureIndex) =>
        resolveFeatureCustomizations(feature, context).flatMap((customization, customizationIndex) =>
            (customization.panels ?? []).map((entry, entryIndex) => ({
                entry,
                insertion: featureIndex * 1_000_000 + customizationIndex * 1_000 + entryIndex,
            }))
        )
    );

    return indexed
        .sort((left, right) => {
            const kindOrder = left.entry.kind.localeCompare(right.entry.kind);
            if (kindOrder !== 0) return kindOrder;
            const leftOrder = left.entry.order ?? Number.POSITIVE_INFINITY;
            const rightOrder = right.entry.order ?? Number.POSITIVE_INFINITY;
            if (leftOrder !== rightOrder) return leftOrder - rightOrder;
            return left.insertion - right.insertion;
        })
        .map(({ entry }) => entry);
};

/**
 * Convenience selector for callers that only need entries for a single
 * shell surface (e.g. the mobile tab bar or the desktop sidebar).
 */
export const selectPanelsByKind = (
    panels: readonly ShellPanelEntry[],
    kind: ShellPanelKind
): ShellPanelEntry[] => panels.filter((entry) => entry.kind === kind);
