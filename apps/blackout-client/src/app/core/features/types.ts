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

export type BlackoutFeature = {
    id: string;
    name: string;
    routes?: FeatureRoute[];
    navItems?: FeatureNavItem[];
    settings?: FeatureSettingsItem[];
    capabilities?: string[];
    init?: () => void | Promise<void>;
};

export type FeatureFlagKey = keyof FeatureFlags;

export type FeatureModule = {
    feature: BlackoutFeature;
    flag?: FeatureFlagKey;
};

export type FeatureModulePlugin = {
    id: string;
    modules: FeatureModule[];
};
