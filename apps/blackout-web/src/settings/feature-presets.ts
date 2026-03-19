export type FeaturePresetKey = "baseline_matrix" | "community_plus" | "blackout_full";

export type FeatureFlagMap = Record<string, boolean>;

export interface DeploymentPresetConfig {
  preset?: FeaturePresetKey;
  defaults?: FeatureFlagMap;
}

export interface TenantPresetPolicy {
  preset?: FeaturePresetKey;
  overrides?: FeatureFlagMap;
  allowUserOverrides?: boolean;
  userOverrideAllowlist?: string[];
}

export interface UserPresetOverrides {
  overrides?: FeatureFlagMap;
}

export interface ResolvedPresetConfig {
  activePreset: FeaturePresetKey;
  features: FeatureFlagMap;
  diagnostics: {
    deploymentPreset: FeaturePresetKey;
    tenantPreset: FeaturePresetKey | null;
    userOverrideCount: number;
  };
}

const BASELINE_MATRIX: FeatureFlagMap = {
  "features.matrix.client": true,
  "features.matrix.homeserverDiscovery": true,
  "features.security.e2eeDefaults": true,
  "features.auth.oidc": true,
  "features.matrix.widgetCompat": true,
  "features.composer.richEditing": false,
  "features.composer.typingIndicators": false,
  "features.widgets.layouts": false,
  "features.stego.enabled": false,
  "features.governance.entitlements": false,
  "features.federationBoost.enabled": false,
  "features.townhall.enabled": false,
};

const COMMUNITY_PLUS: FeatureFlagMap = {
  ...BASELINE_MATRIX,
  "features.composer.richEditing": true,
  "features.composer.typingIndicators": true,
  "features.widgets.layouts": true,
};

const BLACKOUT_FULL: FeatureFlagMap = {
  ...COMMUNITY_PLUS,
  "features.stego.enabled": true,
  "features.governance.entitlements": true,
  "features.federationBoost.enabled": true,
  "features.townhall.enabled": true,
};

export const FEATURE_PRESET_BUNDLES: Record<FeaturePresetKey, FeatureFlagMap> = {
  baseline_matrix: BASELINE_MATRIX,
  community_plus: COMMUNITY_PLUS,
  blackout_full: BLACKOUT_FULL,
};

function mergeFeatures(base: FeatureFlagMap, overrides?: FeatureFlagMap): FeatureFlagMap {
  if (!overrides) return { ...base };
  return { ...base, ...overrides };
}

export function resolveFeaturePreset(
  deployment: DeploymentPresetConfig,
  tenantPolicy?: TenantPresetPolicy,
  userOverrides?: UserPresetOverrides,
): ResolvedPresetConfig {
  const deploymentPreset = deployment.preset ?? "baseline_matrix";
  const activePreset = tenantPolicy?.preset ?? deploymentPreset;

  let features = { ...FEATURE_PRESET_BUNDLES[activePreset] };
  features = mergeFeatures(features, deployment.defaults);
  features = mergeFeatures(features, tenantPolicy?.overrides);

  let userOverrideCount = 0;
  if (tenantPolicy?.allowUserOverrides && userOverrides?.overrides) {
    const allowlist = tenantPolicy.userOverrideAllowlist;
    const filteredOverrides = Object.fromEntries(
      Object.entries(userOverrides.overrides).filter(([key]) => !allowlist || allowlist.includes(key)),
    );

    userOverrideCount = Object.keys(filteredOverrides).length;
    features = mergeFeatures(features, filteredOverrides);
  }

  return {
    activePreset,
    features,
    diagnostics: {
      deploymentPreset,
      tenantPreset: tenantPolicy?.preset ?? null,
      userOverrideCount,
    },
  };
}
