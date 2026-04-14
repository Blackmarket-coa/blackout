import type { EntitlementResolverInput, ResolvedEntitlement } from "@blackout/protocol";

export function resolveSdkEntitlement(input: EntitlementResolverInput): ResolvedEntitlement {
  const { key, deploymentPreset, workspaceTier, userOverride } = input;

  if (Object.prototype.hasOwnProperty.call(userOverride ?? {}, key)) {
    return { key, enabled: Boolean(userOverride?.[key]), source: "user_override" };
  }

  if (Object.prototype.hasOwnProperty.call(workspaceTier ?? {}, key)) {
    return { key, enabled: Boolean(workspaceTier?.[key]), source: "workspace_tier" };
  }

  if (Object.prototype.hasOwnProperty.call(deploymentPreset, key)) {
    return { key, enabled: Boolean(deploymentPreset[key]), source: "deployment_preset" };
  }

  return { key, enabled: false, source: "fallback" };
}
