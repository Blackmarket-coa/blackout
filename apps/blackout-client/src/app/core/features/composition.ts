import { resolveFeatureCustomizations, type CapabilityGateContext } from './capabilityGate';
import type {
    BlackoutFeature,
    FeatureModule,
    FeatureNavItem,
    FeatureRoute,
    FeatureSettingsItem,
} from './types';

export const assertFeatureModulesRegistered = (
    modules: FeatureModule[],
    registeredFeatureModuleIds: readonly string[],
    source: 'core' | 'plugin'
): void => {
    const allowed = new Set(registeredFeatureModuleIds);

    for (const module of modules) {
        if (!allowed.has(module.feature.id)) {
            throw new Error(
                `[feature-registry] ${source} module "${module.feature.id}" is not registered in registeredFeatureModuleIds.`
            );
        }
    }
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
