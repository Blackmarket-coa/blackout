import type { ComponentType } from 'react';
import type { FeatureFlags } from './featureFlags';

export type FeatureRoute = {
    path: string;
    component: ComponentType;
};

export type FeatureNavItem = {
    label: string;
    to: string;
    icon?: ComponentType;
};

export type FeatureSettingsItem = {
    section: string;
    component: ComponentType;
};

export type PluginCategory =
    | 'visual/layout plugin'
    | 'interaction plugin'
    | 'workflow plugin'
    | 'service-backed plugin';

export type FeatureFlagKey = keyof FeatureFlags;

export type CapabilityGate = {
    allOf?: string[];
    anyOf?: string[];
    not?: string[];
    flags?: FeatureFlagKey[];
};

export type FeatureCustomizationManifest = {
    id: string;
    name: string;
    category: PluginCategory;
    capabilityGate?: CapabilityGate;
    routes?: FeatureRoute[];
    navItems?: FeatureNavItem[];
    settings?: FeatureSettingsItem[];
};

export type BlackoutFeature = {
    id: string;
    name: string;
    routes?: FeatureRoute[];
    navItems?: FeatureNavItem[];
    settings?: FeatureSettingsItem[];
    capabilities?: string[];
    customizations?: FeatureCustomizationManifest[];
    init?: () => void | Promise<void>;
};

export type FeatureModule = {
    feature: BlackoutFeature;
    flag?: FeatureFlagKey;
};

/**
 * Plugin boundary for feature module composition.
 * Ordering and allowlist validation are applied in core composition helpers.
 */
export type FeatureModulePlugin = {
    id: string;
    modules: FeatureModule[];
};
