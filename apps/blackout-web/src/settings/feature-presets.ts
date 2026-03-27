export type FeaturePresetKey = "tier_free" | "tier_pro" | "tier_enterprise";

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

const TIER_FREE: FeatureFlagMap = {
  "features.matrix.client": true,
  "features.matrix.homeserverDiscovery": true,
  "features.security.e2eeDefaults": true,
  "features.auth.oidc": true,
  "features.matrix.widgetCompat": true,

  // Cinny extraction foundations.
  "features.platform.bootstrap": false,
  "features.timeline.virtualized": false,
  "features.timeline.threads": false,
  "features.timeline.readReceipts": false,
  "features.timeline.typingIndicators": false,
  "features.timeline.pinnedMessages": false,
  "features.composer.richEditing": false,
  "features.composer.replies": false,
  "features.composer.edits": false,
  "features.composer.redactions": false,
  "features.composer.typingIndicators": false,
  "features.media.pipeline": false,
  "features.media.spoilers": false,
  "features.media.codeBlocks": false,
  "features.media.linkPreviews": false,
  "features.nav.spaceHierarchy": false,
  "features.nav.dmList": false,
  "features.nav.roomInvites": false,
  "features.nav.search": false,
  "features.widgets.layouts": false,
  "features.settings.framework": false,
  "features.settings.notifications": false,
  "features.settings.appearance": false,
  "features.settings.account": false,
  "features.settings.emoji": false,
  "features.settings.zoom": false,
  "features.call.elementCall": false,

  // Blackout build-from-scratch features.
  "features.bmc.roles": false,
  "features.bmc.welcome": false,
  "features.bmc.onboarding": false,
  "features.bmc.forum": false,
  "features.bmc.soundboard": false,
  "features.bmc.templates": false,
  "features.bmc.banner": false,
  "features.bmc.inviteSplash": false,
  "features.bmc.governance": false,
  "features.bmc.steganography": false,
  "features.bmc.deaddrop": false,
  "features.bmc.cellRouting": false,
  "features.bmc.numbersStation": false,
  "features.bmc.solarpunkTheme": false,
  "features.bmc.extendedProfile": false,
  "features.bmc.quickSwitcher": false,
  "features.bmc.serverFolders": false,
  "features.bmc.bookmarks": false,
  "features.bmc.streamerMode": false,
  "features.bmc.developerMode": false,
  "features.bmc.richPresence": false,
  "features.bmc.dmPermissions": false,
  "features.bmc.stageChannels": false,
  "features.bmc.timeout": false,
  "features.bmc.automod": false,
  "features.bmc.auditLog": false,
  "features.bmc.raidProtection": false,
  "features.bmc.nsfwGate": false,
  "features.bmc.slowmode": false,

  // Existing feature tracks.
  "features.stego.enabled": false,
  "features.stego.ephemeral": false,
  "features.governance.entitlements": false,
  "features.federationBoost.enabled": false,
  "features.townhall.enabled": false,
  "features.epic.deliveryBlueprint": false,
  "features.engagement.discover": false,
  "features.engagement.streaks": false,
  "features.engagement.leaderboards": false,
  "features.engagement.presenceDigest": false,
  "features.engagement.recommendations": false,
  "features.engagement.experiments": false,
  "features.engagement.wellbeing": true,
};

const TIER_PRO: FeatureFlagMap = {
  ...TIER_FREE,
  "features.composer.richEditing": true,
  "features.composer.typingIndicators": true,
  "features.widgets.layouts": true,
  "features.timeline.virtualized": true,
  "features.nav.spaceHierarchy": true,
  "features.nav.dmList": true,
  "features.settings.framework": true,
  "features.settings.notifications": true,
  "features.settings.appearance": true,
  "features.settings.account": true,
};

const TIER_ENTERPRISE: FeatureFlagMap = {
  ...TIER_PRO,
  "features.platform.bootstrap": true,
  "features.timeline.threads": true,
  "features.timeline.readReceipts": true,
  "features.timeline.typingIndicators": true,
  "features.timeline.pinnedMessages": true,
  "features.composer.replies": true,
  "features.composer.edits": true,
  "features.composer.redactions": true,
  "features.media.pipeline": true,
  "features.media.spoilers": true,
  "features.media.codeBlocks": true,
  "features.media.linkPreviews": true,
  "features.nav.roomInvites": true,
  "features.nav.search": true,
  "features.settings.emoji": true,
  "features.settings.zoom": true,
  "features.call.elementCall": true,

  "features.bmc.roles": true,
  "features.bmc.welcome": true,
  "features.bmc.onboarding": true,
  "features.bmc.forum": true,
  "features.bmc.soundboard": true,
  "features.bmc.templates": true,
  "features.bmc.banner": true,
  "features.bmc.inviteSplash": true,
  "features.bmc.governance": true,
  "features.bmc.steganography": true,
  "features.bmc.deaddrop": true,
  "features.bmc.cellRouting": true,
  "features.bmc.numbersStation": true,
  "features.bmc.solarpunkTheme": true,
  "features.bmc.extendedProfile": true,
  "features.bmc.quickSwitcher": true,
  "features.bmc.serverFolders": true,
  "features.bmc.bookmarks": true,
  "features.bmc.streamerMode": true,
  "features.bmc.developerMode": true,
  "features.bmc.richPresence": true,
  "features.bmc.dmPermissions": true,
  "features.bmc.stageChannels": true,
  "features.bmc.timeout": true,
  "features.bmc.automod": true,
  "features.bmc.auditLog": true,
  "features.bmc.raidProtection": true,
  "features.bmc.nsfwGate": true,
  "features.bmc.slowmode": true,

  "features.stego.enabled": true,
  "features.stego.ephemeral": true,
  "features.governance.entitlements": true,
  "features.federationBoost.enabled": true,
  "features.townhall.enabled": true,
  "features.epic.deliveryBlueprint": true,
  "features.engagement.discover": true,
  "features.engagement.streaks": true,
  "features.engagement.leaderboards": true,
  "features.engagement.presenceDigest": true,
  "features.engagement.recommendations": true,
  "features.engagement.experiments": true,
  "features.engagement.wellbeing": true,
};

export const FEATURE_PRESET_BUNDLES: Record<FeaturePresetKey, FeatureFlagMap> = {
  tier_free: TIER_FREE,
  tier_pro: TIER_PRO,
  tier_enterprise: TIER_ENTERPRISE,
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
  const deploymentPreset = deployment.preset ?? "tier_enterprise";
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
