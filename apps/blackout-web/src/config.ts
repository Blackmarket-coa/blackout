import {
  FEATURE_PRESET_BUNDLES,
  resolveFeaturePreset,
  type DeploymentPresetConfig,
  type FeaturePresetKey,
  type ResolvedPresetConfig,
  type TenantPresetPolicy,
  type UserPresetOverrides,
} from "./settings/feature-presets";
import { resolveEngagementPolicy } from "./settings/engagement-policy";
import type { ReleaseCohort } from "./services/telemetry";
import type { EngagementPolicy, NotificationRule } from "./types";

const DEFAULT_HOMESERVER_URL = "https://matrix.blackout.local";

function normalizeRailwayReference(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) return trimmed;

  const railwayMatch = trimmed.match(/^railway:(?<service>[a-z0-9-_.]+)$/i);
  if (railwayMatch?.groups?.service) {
    return `https://${railwayMatch.groups.service}.up.railway.app`;
  }

  return trimmed;
}

function parseJsonEnv<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") return false;
  return fallback;
}

function isFeaturePresetKey(value: string): value is FeaturePresetKey {
  return value in FEATURE_PRESET_BUNDLES;
}

function parsePresetEnv(value: string | undefined): { preset?: FeaturePresetKey } | undefined {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (isFeaturePresetKey(trimmed)) {
    return { preset: trimmed };
  }

  return parseJsonEnv<{ preset?: FeaturePresetKey } | undefined>(value, undefined);
}

export function resolveMatrixHomeserverUrl(env: Record<string, string | undefined>): string {
  const candidate = env.VITE_MATRIX_HOMESERVER_URL ?? env.BLACKOUT_SERVER_URL;
  if (!candidate) return DEFAULT_HOMESERVER_URL;

  const normalized = normalizeRailwayReference(candidate);
  if (!normalized.startsWith("https://") && !normalized.startsWith("http://")) {
    return `https://${normalized}`;
  }
  return normalized;
}

export interface BlackoutRuntimeConfig {
  homeserverUrl: string;
  mode: "daily-chat";
  rollout: {
    cohort: ReleaseCohort;
  };
  presets: ResolvedPresetConfig;
  simpleMode: {
    enabledByDefault: boolean;
    showAdvancedAdminModules: boolean;
    onboardingProgressiveDisclosure: boolean;
  };
  engagement: {
    policy: EngagementPolicy;
    notificationRules: NotificationRule[];
  };
}

function resolveReleaseCohort(raw: string | undefined): ReleaseCohort {
  if (raw === "internal" || raw === "beta" || raw === "general") return raw;
  return "internal";
}

export function resolveBlackoutRuntimeConfig(env: Record<string, string | undefined>): BlackoutRuntimeConfig {
  const deployment = parsePresetEnv(env.VITE_FEATURE_DEPLOYMENT_DEFAULTS) as DeploymentPresetConfig | undefined;
  const tenantPolicy = parsePresetEnv(env.VITE_FEATURE_TENANT_POLICY) as TenantPresetPolicy | undefined;
  const userOverrides = parseJsonEnv<UserPresetOverrides | undefined>(env.VITE_FEATURE_USER_OVERRIDES, undefined);

  const serverEngagement = parseJsonEnv<Partial<EngagementPolicy> | undefined>(env.VITE_ENGAGEMENT_POLICY_SERVER, undefined);
  const userEngagement = parseJsonEnv<Partial<EngagementPolicy> | undefined>(env.VITE_ENGAGEMENT_POLICY_USER, undefined);
  const notificationRules = parseJsonEnv<NotificationRule[] | undefined>(env.VITE_NOTIFICATION_RULES, undefined) ?? [];

  return {
    homeserverUrl: resolveMatrixHomeserverUrl(env),
    mode: "daily-chat",
    rollout: {
      cohort: resolveReleaseCohort(env.VITE_RELEASE_COHORT),
    },
    presets: resolveFeaturePreset(deployment ?? {}, tenantPolicy, userOverrides),
    simpleMode: {
      enabledByDefault: parseBooleanEnv(env.VITE_SIMPLE_MODE_DEFAULT, true),
      showAdvancedAdminModules: parseBooleanEnv(env.VITE_SHOW_ADVANCED_ADMIN_MODULES, false),
      onboardingProgressiveDisclosure: parseBooleanEnv(env.VITE_ONBOARDING_PROGRESSIVE_DISCLOSURE, true),
    },
    engagement: {
      policy: resolveEngagementPolicy({
        server: serverEngagement,
        user: userEngagement,
      }),
      notificationRules,
    },
  };
}
