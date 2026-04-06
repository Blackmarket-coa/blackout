import { describe, expect, it } from "vitest";

import { resolveBlackoutRuntimeConfig, resolveMatrixHomeserverUrl } from "../../src/config";

describe("resolveMatrixHomeserverUrl", () => {
  it("supports railway shorthand", () => {
    const url = resolveMatrixHomeserverUrl({ VITE_MATRIX_HOMESERVER_URL: "railway:blackout-prod" });
    expect(url).toBe("https://blackout-prod.up.railway.app");
  });

  it("falls back to default url", () => {
    const url = resolveMatrixHomeserverUrl({});
    expect(url).toBe("https://matrix.theblackout.app");
  });

  it("uses BLACKOUT_SERVER_URL when VITE_MATRIX_HOMESERVER_URL is missing", () => {
    const url = resolveMatrixHomeserverUrl({ BLACKOUT_SERVER_URL: "matrix.blackout.example" });
    expect(url).toBe("https://matrix.blackout.example");
  });
});

describe("resolveBlackoutRuntimeConfig", () => {
  it("defaults to starter preset bundle", () => {
    const config = resolveBlackoutRuntimeConfig({});

    expect(config.presets.activePreset).toBe("starter");
    expect(config.rollout.cohort).toBe("internal");
    expect(config.presets.features["features.matrix.client"]).toBe(true);
    expect(config.presets.features["features.stego.enabled"]).toBe(false);
  });

  it("merges deployment, tenant, and user overrides when allowed", () => {
    const config = resolveBlackoutRuntimeConfig({
      VITE_FEATURE_DEPLOYMENT_DEFAULTS: JSON.stringify({
        preset: "governance",
        defaults: {
          "features.matrix.widgetCompat": false,
        },
      }),
      VITE_FEATURE_TENANT_POLICY: JSON.stringify({
        preset: "sovereignty",
        overrides: {
          "features.townhall.enabled": false,
        },
        allowUserOverrides: true,
        userOverrideAllowlist: ["features.composer.typingIndicators"],
      }),
      VITE_FEATURE_USER_OVERRIDES: JSON.stringify({
        overrides: {
          "features.composer.typingIndicators": false,
          "features.stego.enabled": false,
        },
      }),
      VITE_RELEASE_COHORT: "beta",
    });

    expect(config.presets.activePreset).toBe("sovereignty");
    expect(config.presets.features["features.matrix.widgetCompat"]).toBe(false);
    expect(config.presets.features["features.townhall.enabled"]).toBe(false);
    expect(config.presets.features["features.composer.typingIndicators"]).toBe(false);
    expect(config.presets.features["features.stego.enabled"]).toBe(true);
    expect(config.presets.diagnostics.userOverrideCount).toBe(1);
    expect(config.rollout.cohort).toBe("beta");
  });

  it("migrates legacy tier preset keys without forcing tenant changes", () => {
    const config = resolveBlackoutRuntimeConfig({
      VITE_FEATURE_DEPLOYMENT_DEFAULTS: "tier_pro",
      VITE_FEATURE_TENANT_POLICY: "tier_enterprise",
    });

    expect(config.presets.activePreset).toBe("sovereignty");
    expect(config.presets.diagnostics.deploymentPreset).toBe("governance");
  });

  it("accepts shorthand preset strings for deployment and tenant env vars", () => {
    const config = resolveBlackoutRuntimeConfig({
      VITE_FEATURE_DEPLOYMENT_DEFAULTS: "governance",
      VITE_FEATURE_TENANT_POLICY: "sovereignty",
    });

    expect(config.presets.activePreset).toBe("sovereignty");
    expect(config.presets.diagnostics.deploymentPreset).toBe("governance");
    expect(config.presets.features["features.bmc.roles"]).toBe(true);
  });

  it("sets simple mode flags to starter-safe defaults", () => {
    const config = resolveBlackoutRuntimeConfig({});

    expect(config.simpleMode.simple_mode_default).toBe(true);
    expect(config.simpleMode.show_advanced_admin_modules).toBe(false);
    expect(config.simpleMode.onboarding_progressive_disclosure).toBe(true);
  });

  it("supports env overrides for simple mode flags", () => {
    const config = resolveBlackoutRuntimeConfig({
      VITE_SIMPLE_MODE_DEFAULT: "false",
      VITE_SHOW_ADVANCED_ADMIN_MODULES: "true",
      VITE_ONBOARDING_PROGRESSIVE_DISCLOSURE: "false",
    });

    expect(config.simpleMode.simple_mode_default).toBe(false);
    expect(config.simpleMode.show_advanced_admin_modules).toBe(true);
    expect(config.simpleMode.onboarding_progressive_disclosure).toBe(false);
  });


  it("defaults existing tenants to pre-wave behavior unless explicitly enabled", () => {
    const config = resolveBlackoutRuntimeConfig({
      VITE_FEATURE_TENANT_POLICY: JSON.stringify({ preset: "tier_enterprise" }),
    });

    expect(config.simpleMode.simple_mode_default).toBe(false);
    expect(config.simpleMode.show_advanced_admin_modules).toBe(true);
  });

  it("supports snake_case app-level flags", () => {
    const config = resolveBlackoutRuntimeConfig({
      VITE_APP_LEVEL_FLAGS: JSON.stringify({
        simple_mode_default: true,
        show_advanced_admin_modules: false,
        onboarding_progressive_disclosure: true,
      }),
      VITE_FEATURE_TENANT_POLICY: JSON.stringify({ preset: "tier_enterprise" }),
    });

    expect(config.simpleMode.simple_mode_default).toBe(true);
    expect(config.simpleMode.show_advanced_admin_modules).toBe(false);
    expect(config.simpleMode.onboarding_progressive_disclosure).toBe(true);
  });
  it("resolves engagement policy and notification rules from env", () => {
    const config = resolveBlackoutRuntimeConfig({
      VITE_ENGAGEMENT_POLICY_SERVER: JSON.stringify({
        notifications: { mode: "aggressive" },
        wellbeing: { maxNudgesPerDay: 4 },
      }),
      VITE_ENGAGEMENT_POLICY_USER: JSON.stringify({
        notifications: { mode: "minimal" },
      }),
      VITE_NOTIFICATION_RULES: JSON.stringify([
        {
          feature: "presence_digest",
          category: "presence",
          hardCapPerDay: 3,
          cooldownMinutes: 120,
          quietHours: { startUtc: "22:00", endUtc: "07:00" },
        },
      ]),
    });

    expect(config.engagement.policy.notifications.mode).toBe("minimal");
    expect(config.engagement.policy.wellbeing.maxNudgesPerDay).toBe(4);
    expect(config.engagement.notificationRules).toHaveLength(1);
  });

});
