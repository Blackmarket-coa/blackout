export type FeaturePresetKey = 'starter' | 'governance' | 'sovereignty';
export type LegacyFeaturePresetKey = 'tier_free' | 'tier_pro' | 'tier_enterprise';
export type FeatureKillSwitchKey = 'advanced_stego' | 'townhall_sfu' | 'advanced_governance';

export type FeatureFlagMap = Record<string, boolean>;
export type FeatureKillSwitchMap = Partial<Record<FeatureKillSwitchKey, boolean>>;

export interface DeploymentPresetConfig {
  preset?: FeaturePresetKey | LegacyFeaturePresetKey;
  defaults?: FeatureFlagMap;
  presetKillSwitches?: Partial<Record<FeaturePresetKey, FeatureKillSwitchMap>>;
}

export interface TenantPresetPolicy {
  preset?: FeaturePresetKey | LegacyFeaturePresetKey;
  overrides?: FeatureFlagMap;
  allowUserOverrides?: boolean;
  userOverrideAllowlist?: string[];
  tierKillSwitches?: Partial<Record<FeaturePresetKey, FeatureKillSwitchMap>>;
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
    killSwitchesApplied: {
      preset: number;
      tier: number;
    };
  };
}

const PRESET_MIGRATION_MAP: Record<LegacyFeaturePresetKey, FeaturePresetKey> = {
  tier_free: 'starter',
  tier_pro: 'governance',
  tier_enterprise: 'sovereignty',
};

export function normalizeFeaturePresetKey(
  value: string | null | undefined,
): FeaturePresetKey | undefined {
  if (!value) return undefined;
  if (value === 'starter' || value === 'governance' || value === 'sovereignty') return value;
  if (value === 'tier_free' || value === 'tier_pro' || value === 'tier_enterprise') {
    return PRESET_MIGRATION_MAP[value];
  }
  return undefined;
}

const STARTER: FeatureFlagMap = {
  'features.matrix.client': true,
  'features.matrix.homeserverDiscovery': true,
  'features.security.e2eeDefaults': true,
  'features.auth.oidc': true,
  'features.matrix.widgetCompat': true,

  'features.platform.bootstrap': false,
  'features.timeline.virtualized': false,
  'features.timeline.threads': false,
  'features.timeline.readReceipts': false,
  'features.timeline.typingIndicators': false,
  'features.timeline.pinnedMessages': false,
  'features.composer.richEditing': false,
  'features.composer.replies': false,
  'features.composer.edits': false,
  'features.composer.redactions': false,
  'features.composer.typingIndicators': false,
  'features.media.pipeline': false,
  'features.media.spoilers': false,
  'features.media.codeBlocks': false,
  'features.media.linkPreviews': false,
  'features.nav.spaceHierarchy': false,
  'features.nav.dmList': false,
  'features.nav.roomInvites': false,
  'features.nav.search': false,
  'features.widgets.layouts': false,
  'features.settings.framework': false,
  'features.settings.notifications': false,
  'features.settings.appearance': false,
  'features.settings.account': false,
  'features.settings.emoji': false,
  'features.settings.zoom': false,
  'features.call.elementCall': false,

  'features.bmc.roles': false,
  'features.bmc.welcome': false,
  'features.bmc.onboarding': false,
  'features.bmc.forum': false,
  'features.bmc.soundboard': false,
  'features.bmc.templates': false,
  'features.bmc.banner': false,
  'features.bmc.inviteSplash': false,
  'features.bmc.governance': false,
  'features.bmc.steganography': true,
  'features.bmc.deaddrop': false,
  'features.bmc.cellRouting': false,
  'features.bmc.numbersStation': false,
  'features.bmc.solarpunkTheme': false,
  'features.bmc.extendedProfile': false,
  'features.bmc.quickSwitcher': false,
  'features.bmc.serverFolders': false,
  'features.bmc.bookmarks': false,
  'features.bmc.streamerMode': false,
  'features.bmc.developerMode': false,
  'features.bmc.richPresence': false,
  'features.bmc.dmPermissions': false,
  'features.bmc.stageChannels': false,
  'features.bmc.timeout': false,
  'features.bmc.automod': false,
  'features.bmc.auditLog': false,
  'features.bmc.raidProtection': false,
  'features.bmc.nsfwGate': false,
  'features.bmc.slowmode': false,

  'features.stego.enabled': true,
  'features.stego.ephemeral': false,
  'features.governance.entitlements': false,
  'features.federationBoost.enabled': false,
  'features.townhall.enabled': false,
  'features.epic.deliveryBlueprint': false,
  'features.engagement.discover': false,
  'features.engagement.streaks': false,
  'features.engagement.leaderboards': false,
  'features.engagement.presenceDigest': false,
  'features.engagement.recommendations': false,
  'features.engagement.experiments': false,
  'features.engagement.wellbeing': true,
};

const GOVERNANCE: FeatureFlagMap = {
  ...STARTER,
  'features.composer.richEditing': true,
  'features.composer.typingIndicators': true,
  'features.widgets.layouts': true,
  'features.timeline.virtualized': true,
  'features.nav.spaceHierarchy': true,
  'features.nav.dmList': true,
  'features.settings.framework': true,
  'features.settings.notifications': true,
  'features.settings.appearance': true,
  'features.settings.account': true,
  'features.governance.entitlements': true,
};

const SOVEREIGNTY: FeatureFlagMap = {
  ...GOVERNANCE,
  'features.platform.bootstrap': true,
  'features.timeline.threads': true,
  'features.timeline.readReceipts': true,
  'features.timeline.typingIndicators': true,
  'features.timeline.pinnedMessages': true,
  'features.composer.replies': true,
  'features.composer.edits': true,
  'features.composer.redactions': true,
  'features.media.pipeline': true,
  'features.media.spoilers': true,
  'features.media.codeBlocks': true,
  'features.media.linkPreviews': true,
  'features.nav.roomInvites': true,
  'features.nav.search': true,
  'features.settings.emoji': true,
  'features.settings.zoom': true,
  'features.call.elementCall': true,

  'features.bmc.roles': true,
  'features.bmc.welcome': true,
  'features.bmc.onboarding': true,
  'features.bmc.forum': true,
  'features.bmc.soundboard': true,
  'features.bmc.templates': true,
  'features.bmc.banner': true,
  'features.bmc.inviteSplash': true,
  'features.bmc.governance': true,
  'features.bmc.steganography': true,
  'features.bmc.deaddrop': true,
  'features.bmc.cellRouting': true,
  'features.bmc.numbersStation': true,
  'features.bmc.solarpunkTheme': true,
  'features.bmc.extendedProfile': true,
  'features.bmc.quickSwitcher': true,
  'features.bmc.serverFolders': true,
  'features.bmc.bookmarks': true,
  'features.bmc.streamerMode': true,
  'features.bmc.developerMode': true,
  'features.bmc.richPresence': true,
  'features.bmc.dmPermissions': true,
  'features.bmc.stageChannels': true,
  'features.bmc.timeout': true,
  'features.bmc.automod': true,
  'features.bmc.auditLog': true,
  'features.bmc.raidProtection': true,
  'features.bmc.nsfwGate': true,
  'features.bmc.slowmode': true,

  'features.stego.enabled': true,
  'features.stego.ephemeral': true,
  'features.federationBoost.enabled': true,
  'features.townhall.enabled': true,
  'features.epic.deliveryBlueprint': true,
  'features.engagement.discover': true,
  'features.engagement.streaks': true,
  'features.engagement.leaderboards': true,
  'features.engagement.presenceDigest': true,
  'features.engagement.recommendations': true,
  'features.engagement.experiments': true,
  'features.engagement.wellbeing': true,
};

export const FEATURE_PRESET_BUNDLES: Record<FeaturePresetKey, FeatureFlagMap> = {
  starter: STARTER,
  governance: GOVERNANCE,
  sovereignty: SOVEREIGNTY,
};

function mergeFeatures(base: FeatureFlagMap, overrides?: FeatureFlagMap): FeatureFlagMap {
  if (!overrides) return { ...base };
  return { ...base, ...overrides };
}

const FEATURE_KEYS_BY_KILL_SWITCH: Record<FeatureKillSwitchKey, string[]> = {
  advanced_stego: ['features.stego.ephemeral', 'features.bmc.deaddrop'],
  townhall_sfu: ['features.townhall.enabled'],
  advanced_governance: ['features.governance.entitlements', 'features.bmc.governance'],
};

function countEnabledKillSwitches(killSwitches: FeatureKillSwitchMap | undefined): number {
  if (!killSwitches) return 0;
  return Object.values(killSwitches).filter(Boolean).length;
}

function applyKillSwitches(features: FeatureFlagMap, killSwitches: FeatureKillSwitchMap | undefined): FeatureFlagMap {
  if (!killSwitches) return features;

  const next = { ...features };
  for (const [switchName, enabled] of Object.entries(killSwitches) as Array<[FeatureKillSwitchKey, boolean | undefined]>) {
    if (!enabled) continue;
    for (const featureKey of FEATURE_KEYS_BY_KILL_SWITCH[switchName]) {
      next[featureKey] = false;
    }
  }
  return next;
}

export function resolveFeaturePreset(
  deployment: DeploymentPresetConfig,
  tenantPolicy?: TenantPresetPolicy,
  userOverrides?: UserPresetOverrides,
): ResolvedPresetConfig {
  const deploymentPreset = normalizeFeaturePresetKey(deployment.preset) ?? 'starter';
  const tenantPreset = normalizeFeaturePresetKey(tenantPolicy?.preset);
  const activePreset = tenantPreset ?? deploymentPreset;

  let features = { ...FEATURE_PRESET_BUNDLES[deploymentPreset] };
  features = mergeFeatures(features, deployment.defaults);
  if (tenantPreset) {
    features = mergeFeatures(features, FEATURE_PRESET_BUNDLES[tenantPreset]);
  }
  features = mergeFeatures(features, tenantPolicy?.overrides);
  const presetKillSwitches = deployment.presetKillSwitches?.[deploymentPreset];
  const tierKillSwitches = tenantPreset ? tenantPolicy?.tierKillSwitches?.[tenantPreset] : undefined;
  features = applyKillSwitches(features, presetKillSwitches);
  features = applyKillSwitches(features, tierKillSwitches);

  let userOverrideCount = 0;
  if (tenantPolicy?.allowUserOverrides && userOverrides?.overrides) {
    const allowlist = tenantPolicy.userOverrideAllowlist;
    const filteredOverrides = Object.fromEntries(
      Object.entries(userOverrides.overrides).filter(
        ([key]) => !allowlist || allowlist.includes(key),
      ),
    );

    userOverrideCount = Object.keys(filteredOverrides).length;
    features = mergeFeatures(features, filteredOverrides);
  }

  return {
    activePreset,
    features,
    diagnostics: {
      deploymentPreset,
      tenantPreset: tenantPreset ?? null,
      userOverrideCount,
      killSwitchesApplied: {
        preset: countEnabledKillSwitches(presetKillSwitches),
        tier: countEnabledKillSwitches(tierKillSwitches),
      },
    },
  };
}
