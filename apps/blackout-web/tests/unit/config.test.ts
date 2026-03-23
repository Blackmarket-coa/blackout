import { describe, expect, it } from "vitest";

import { resolveBlackoutRuntimeConfig, resolveMatrixHomeserverUrl } from "../../src/config";

describe("resolveMatrixHomeserverUrl", () => {
  it("supports railway shorthand", () => {
    const url = resolveMatrixHomeserverUrl({ VITE_MATRIX_HOMESERVER_URL: "railway:blackout-prod" });
    expect(url).toBe("https://blackout-prod.up.railway.app");
  });

  it("falls back to default url", () => {
    const url = resolveMatrixHomeserverUrl({});
    expect(url).toBe("https://matrix.blackout.local");
  });
});

describe("resolveBlackoutRuntimeConfig", () => {
  it("defaults to blackout_full preset bundle", () => {
    const config = resolveBlackoutRuntimeConfig({});

    expect(config.presets.activePreset).toBe("blackout_full");
    expect(config.rollout.cohort).toBe("internal");
    expect(config.presets.features["features.matrix.client"]).toBe(true);
    expect(config.presets.features["features.stego.enabled"]).toBe(true);
  });

  it("merges deployment, tenant, and user overrides when allowed", () => {
    const config = resolveBlackoutRuntimeConfig({
      VITE_FEATURE_DEPLOYMENT_DEFAULTS: JSON.stringify({
        preset: "community_plus",
        defaults: {
          "features.matrix.widgetCompat": false,
        },
      }),
      VITE_FEATURE_TENANT_POLICY: JSON.stringify({
        preset: "blackout_full",
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

    expect(config.presets.activePreset).toBe("blackout_full");
    expect(config.presets.features["features.matrix.widgetCompat"]).toBe(false);
    expect(config.presets.features["features.townhall.enabled"]).toBe(false);
    expect(config.presets.features["features.composer.typingIndicators"]).toBe(false);
    expect(config.presets.features["features.stego.enabled"]).toBe(true);
    expect(config.presets.diagnostics.userOverrideCount).toBe(1);
    expect(config.rollout.cohort).toBe("beta");
  });

  it("accepts shorthand preset strings for deployment and tenant env vars", () => {
    const config = resolveBlackoutRuntimeConfig({
      VITE_FEATURE_DEPLOYMENT_DEFAULTS: "community_plus",
      VITE_FEATURE_TENANT_POLICY: "blackout_full",
    });

    expect(config.presets.activePreset).toBe("blackout_full");
    expect(config.presets.diagnostics.deploymentPreset).toBe("community_plus");
    expect(config.presets.features["features.bmc.roles"]).toBe(true);
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
