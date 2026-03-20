import {
  FEATURE_PRESET_BUNDLES,
  resolveFeaturePreset,
  type DeploymentPresetConfig,
  type FeaturePresetKey,
  type ResolvedPresetConfig,
  type TenantPresetPolicy,
  type UserPresetOverrides,
} from "./settings/feature-presets";
import type { ReleaseCohort } from "./services/telemetry";

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
}

function resolveReleaseCohort(raw: string | undefined): ReleaseCohort {
  if (raw === "internal" || raw === "beta" || raw === "general") return raw;
  return "internal";
}

export function resolveBlackoutRuntimeConfig(env: Record<string, string | undefined>): BlackoutRuntimeConfig {
  const deployment = parsePresetEnv(env.VITE_FEATURE_DEPLOYMENT_DEFAULTS) as DeploymentPresetConfig | undefined;
  const tenantPolicy = parsePresetEnv(env.VITE_FEATURE_TENANT_POLICY) as TenantPresetPolicy | undefined;
  const userOverrides = parseJsonEnv<UserPresetOverrides | undefined>(env.VITE_FEATURE_USER_OVERRIDES, undefined);

  return {
    homeserverUrl: resolveMatrixHomeserverUrl(env),
    mode: "daily-chat",
    rollout: {
      cohort: resolveReleaseCohort(env.VITE_RELEASE_COHORT),
    },
    presets: resolveFeaturePreset(deployment ?? {}, tenantPolicy, userOverrides),
  };
}
