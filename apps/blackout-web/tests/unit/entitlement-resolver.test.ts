import { describe, expect, it } from "vitest";

import { resolveEntitlement } from "../../src/settings/entitlement-resolver";
import { resolveFeaturePreset } from "../../src/settings/feature-presets";

describe("resolveEntitlement", () => {
  it("resolves free/pro/team/enterprise layers with user override precedence", () => {
    const free = { "features.governance.entitlements": false } as const;
    const pro = { "features.governance.entitlements": true } as const;
    const team = { "features.governance.entitlements": true } as const;
    const enterprise = { "features.governance.entitlements": true } as const;

    expect(
      resolveEntitlement({ key: "features.governance.entitlements", deploymentPreset: free }).source,
    ).toBe("deployment_preset");

    expect(
      resolveEntitlement({
        key: "features.governance.entitlements",
        deploymentPreset: free,
        workspaceTier: pro,
      }).source,
    ).toBe("workspace_tier");

    expect(
      resolveEntitlement({
        key: "features.governance.entitlements",
        deploymentPreset: free,
        workspaceTier: team,
      }).enabled,
    ).toBe(true);

    expect(
      resolveEntitlement({
        key: "features.governance.entitlements",
        deploymentPreset: free,
        workspaceTier: enterprise,
        userOverride: { "features.governance.entitlements": false },
      }),
    ).toMatchObject({ enabled: false, source: "user_override" });
  });

  it("falls back to disabled when a downgrade removes workspace and user layers", () => {
    const upgraded = resolveEntitlement({
      key: "features.stego.enabled",
      deploymentPreset: { "features.stego.enabled": false },
      workspaceTier: { "features.stego.enabled": true },
      userOverride: { "features.stego.enabled": true },
    });

    const downgraded = resolveEntitlement({
      key: "features.stego.enabled",
      deploymentPreset: {},
      workspaceTier: {},
      userOverride: {},
    });

    expect(upgraded.enabled).toBe(true);
    expect(downgraded).toMatchObject({ enabled: false, source: "fallback" });
  });
});

describe("resolveFeaturePreset downgrade behavior", () => {
  it("falls back to deployment layer when workspace tier is removed", () => {
    const upgraded = resolveFeaturePreset(
      { preset: "starter" },
      {
        preset: "sovereignty",
        allowUserOverrides: true,
      },
      {
        overrides: {
          "features.composer.typingIndicators": false,
        },
      },
    );

    const downgraded = resolveFeaturePreset({ preset: "starter" }, undefined, {
      overrides: {
        "features.composer.typingIndicators": false,
      },
    });

    expect(upgraded.features["features.composer.typingIndicators"]).toBe(false);
    expect(downgraded.features["features.composer.typingIndicators"]).toBe(false);
    expect(downgraded.diagnostics.tenantPreset).toBeNull();
    expect(downgraded.diagnostics.userOverrideCount).toBe(0);
  });
});
