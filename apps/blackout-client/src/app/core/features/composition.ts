import type { BlackoutFeature, FeatureNavItem, FeatureRoute, FeatureSettingsItem } from './types';

export const composeFeatureRoutes = (registry: BlackoutFeature[]): FeatureRoute[] =>
    registry.flatMap((feature) => feature.routes ?? []);

export const composeFeatureNavItems = (registry: BlackoutFeature[]): FeatureNavItem[] =>
    registry.flatMap((feature) => feature.navItems ?? []);

export const composeFeatureSettings = (registry: BlackoutFeature[]): FeatureSettingsItem[] =>
    registry.flatMap((feature) => feature.settings ?? []);
