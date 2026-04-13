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
