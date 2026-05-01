export type EntitlementKey = `features.${string}`;
export type EntitlementMap = Partial<Record<EntitlementKey, boolean>>;
export type EntitlementResolutionSource = "deployment_preset" | "workspace_tier" | "user_override" | "fallback";

export interface EntitlementResolverInput {
  key: EntitlementKey;
  deploymentPreset: EntitlementMap;
  workspaceTier?: EntitlementMap;
  userOverride?: EntitlementMap;
}

export interface ResolvedEntitlement {
  key: EntitlementKey;
  enabled: boolean;
  source: EntitlementResolutionSource;
}

function hasOwn(map: EntitlementMap | undefined, key: EntitlementKey): boolean {
  return Boolean(map && Object.prototype.hasOwnProperty.call(map, key));
}

export function resolveEntitlement(input: EntitlementResolverInput): ResolvedEntitlement {
  const { key, deploymentPreset, workspaceTier, userOverride } = input;

  if (hasOwn(userOverride, key)) {
    return { key, enabled: Boolean(userOverride?.[key]), source: "user_override" };
  }

  if (hasOwn(workspaceTier, key)) {
    return { key, enabled: Boolean(workspaceTier?.[key]), source: "workspace_tier" };
  }

  if (hasOwn(deploymentPreset, key)) {
    return { key, enabled: Boolean(deploymentPreset[key]), source: "deployment_preset" };
  }

  return { key, enabled: false, source: "fallback" };
}

export interface ResolvedEntitlementState {
  deploymentPreset: EntitlementMap;
  workspaceTier?: EntitlementMap;
  userOverride?: EntitlementMap;
}

export function resolveEntitlementMap(
  keys: readonly EntitlementKey[],
  input: Omit<EntitlementResolverInput, "key">,
): EntitlementMap {
  return Object.fromEntries(keys.map((key) => [key, resolveEntitlement({ ...input, key }).enabled]));
}
