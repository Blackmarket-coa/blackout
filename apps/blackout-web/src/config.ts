import {
  resolveFeaturePreset,
  type DeploymentPresetConfig,
  type ResolvedPresetConfig,
  type TenantPresetPolicy,
  type UserPresetOverrides,
} from "./settings/feature-presets";

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
  presets: ResolvedPresetConfig;
}

export function resolveBlackoutRuntimeConfig(env: Record<string, string | undefined>): BlackoutRuntimeConfig {
  const deployment = parseJsonEnv<DeploymentPresetConfig>(env.VITE_FEATURE_DEPLOYMENT_DEFAULTS, {});
  const tenantPolicy = parseJsonEnv<TenantPresetPolicy | undefined>(env.VITE_FEATURE_TENANT_POLICY, undefined);
  const userOverrides = parseJsonEnv<UserPresetOverrides | undefined>(env.VITE_FEATURE_USER_OVERRIDES, undefined);

  return {
    homeserverUrl: resolveMatrixHomeserverUrl(env),
    mode: "daily-chat",
    presets: resolveFeaturePreset(deployment, tenantPolicy, userOverrides),
  };
}
