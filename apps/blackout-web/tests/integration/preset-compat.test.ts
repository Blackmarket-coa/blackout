import { describe, expect, it } from "vitest";

import { BlackoutWebApp } from "../../src/app";

describe("preset compatibility", () => {
  it("opens settings when legacy tier preset values are provided", async () => {
    document.body.innerHTML = `<div id=\"app\"></div>`;
    const root = document.querySelector("#app") as HTMLElement;

    const app = new BlackoutWebApp(root, {
      homeserverUrl: "https://matrix.blackout.local",
      mode: "daily-chat",
      rollout: { cohort: "internal" },
      presets: {
        activePreset: "tier_enterprise" as never,
        features: {},
        diagnostics: {
          deploymentPreset: "tier_enterprise" as never,
          tenantPreset: null,
          userOverrideCount: 0,
        },
      },
      simpleMode: {
        simple_mode_default: true,
        show_advanced_admin_modules: false,
        onboarding_progressive_disclosure: true,
      },
      engagement: {
        policy: {
          notifications: { mode: "balanced" },
          discover: { enabled: true },
          streaks: { enabled: false },
          leaderboards: { enabled: false },
          wellbeing: { breakPrompts: { enabled: true }, maxNudgesPerDay: 3 },
        },
        notificationRules: [],
      },
    });

    await app.mount();
    root.querySelector<HTMLButtonElement>("[data-testid='toggle-settings-button']")?.click();

    expect(root.querySelector("[data-testid='feature-presets-panel']")).toBeTruthy();
    expect(root.querySelector("[data-testid='preset-capability-meter']")).toBeTruthy();
  });
});
