export type EntitlementKey = `features.${string}`;

export type EntitlementTier = "free" | "pro" | "team" | "enterprise";

export type EntitlementMap = Partial<Record<EntitlementKey, boolean>>;

export type EntitlementResolutionSource = "deployment_preset" | "workspace_tier" | "user_override" | "fallback";

export type ResolvedEntitlement = {
  key: EntitlementKey;
  enabled: boolean;
  source: EntitlementResolutionSource;
};

export type EntitlementResolverInput = {
  key: EntitlementKey;
  deploymentPreset: EntitlementMap;
  workspaceTier?: EntitlementMap;
  userOverride?: EntitlementMap;
};
