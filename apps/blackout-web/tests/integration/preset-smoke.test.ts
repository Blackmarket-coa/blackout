import { fireEvent } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { BlackoutWebApp } from "../../src/app";

const preset = (process.env.BLACKOUT_SMOKE_PRESET ?? "tier_enterprise") as "tier_free" | "tier_pro" | "tier_enterprise";

const smokeActionByPreset = {
  tier_free: "feature-toggle-matrix-client",
  tier_pro: "feature-composer-rich-editing",
  tier_enterprise: "feature-admin-governance-entitlements",
} as const;

describe("Preset smoke flow", () => {
  it(`runs smoke flow for ${preset}`, async () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector("#app");
    if (!root) throw new Error("missing app root in test");

    const app = new BlackoutWebApp(root, {
      homeserverUrl: "https://matrix.blackout.local",
      mode: "daily-chat",
      rollout: { cohort: "internal" },
      presets: {
        activePreset: preset,
        features: {},
        diagnostics: {
          deploymentPreset: preset,
          tenantPreset: null,
          userOverrideCount: 0,
        },
      },
    });

    await app.mount();
    (root.querySelector('[data-testid="toggle-settings-button"]') as HTMLButtonElement)?.click();

    const testId = smokeActionByPreset[preset];
    const button = root.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement | null;
    expect(button).toBeTruthy();

    fireEvent.click(button as HTMLButtonElement);
    expect(root.querySelector('[data-testid="feature-action-result"]')?.textContent).toContain("Opened");
  });
});
