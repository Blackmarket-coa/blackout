import { resolveFeatureCustomizations, type CapabilityGateContext } from './capabilityGate';
import type { BlackoutFeature, FeatureNavItem, FeatureRoute, FeatureSettingsItem } from './types';

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
