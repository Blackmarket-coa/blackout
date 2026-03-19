import { fireEvent } from "@testing-library/dom";
import { describe, expect, it } from "vitest";

import { BlackoutWebApp } from "../../src/app";

const preset = (process.env.BLACKOUT_SMOKE_PRESET ?? "baseline_matrix") as "baseline_matrix" | "community_plus" | "blackout_full";

const smokeActionByPreset = {
  baseline_matrix: "feature-toggle-matrix-client",
  community_plus: "feature-composer-rich-editing",
  blackout_full: "feature-admin-governance-entitlements",
} as const;

describe("Preset smoke flow", () => {
  it(`runs smoke flow for ${preset}`, async () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const root = document.querySelector("#app");
    if (!root) throw new Error("missing app root in test");

    const app = new BlackoutWebApp(root, {
      homeserverUrl: "https://matrix.blackout.local",
      mode: "daily-chat",
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

    const testId = smokeActionByPreset[preset];
    const button = root.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement | null;
    expect(button).toBeTruthy();

    fireEvent.click(button as HTMLButtonElement);
    expect(root.querySelector('[data-testid="feature-action-result"]')?.textContent).toContain("Opened");
  });
});
