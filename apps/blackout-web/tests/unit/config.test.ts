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
  it("defaults to baseline_matrix preset bundle", () => {
    const config = resolveBlackoutRuntimeConfig({});

    expect(config.presets.activePreset).toBe("baseline_matrix");
    expect(config.rollout.cohort).toBe("internal");
    expect(config.presets.features["features.matrix.client"]).toBe(true);
    expect(config.presets.features["features.stego.enabled"]).toBe(false);
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
});
