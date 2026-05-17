import type { ComponentType } from 'react';
import type { FeatureFlags } from './featureFlags';

export type FeatureRoute = {
    path: string;
    component: ComponentType;
    /**
     * Owning feature/plugin id. Populated by `composeFeatureRoutes` (never
     * authored on a manifest) so the host can label per-route ErrorBoundary
     * fallbacks with the failing plugin.
     */
    pluginId?: string;
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

/**
 * Identifies a shell-level surface a feature can contribute UI into.
 * Mirrors the surfaces blackout-web exposed (workspace tabs, mobile tab bar,
 * sidebar nav, right-panel slots) so feature manifests own a single source of
 * truth for cross-surface registration.
 */
export type ShellPanelKind = 'workspace' | 'mobile-tab' | 'sidebar' | 'right-panel';

export type ShellPanelEntry = {
    /**
     * Unique entry id within a given (kind) bucket. Used by clients to drive
     * `shell.panel.select` events and by the SDK panel metadata facade.
     */
    id: string;
    kind: ShellPanelKind;
    label: string;
    /**
     * Canonical client route that materializes this panel. Required because
     * panel selection is deep-linkable.
     */
    to: string;
    icon?: ComponentType;
    /**
     * Lower numbers render first within their `kind`. Defaults to insertion
     * order when omitted.
     */
    order?: number;
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
    panels?: ShellPanelEntry[];
    /**
     * Marks this customization as an admin-only entry. Lets the canonical
     * shell drive the "show admin entry" gate from manifests instead of
     * ad-hoc booleans (replaces the `showAdminEntry` flag from
     * apps/blackout-web). Admin entries still go through the regular
     * `capabilityGate` evaluation; this flag is purely an annotation so
     * callers can filter to the admin surface.
     */
    adminEntry?: boolean;
};

export type BlackoutFeature = {
    id: string;
    name: string;
    routes?: FeatureRoute[];
    navItems?: FeatureNavItem[];
    settings?: FeatureSettingsItem[];
    panels?: ShellPanelEntry[];
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
