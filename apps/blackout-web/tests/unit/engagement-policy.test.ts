import { describe, expect, it } from "vitest";

import { DEFAULT_ENGAGEMENT_POLICY, resolveEngagementPolicy } from "../../src/settings/engagement-policy";

describe("resolveEngagementPolicy", () => {
  it("returns defaults when no config is provided", () => {
    expect(resolveEngagementPolicy()).toEqual(DEFAULT_ENGAGEMENT_POLICY);
  });

  it("applies server policy and user override with bounded max nudges", () => {
    const policy = resolveEngagementPolicy({
      server: {
        notifications: { mode: "aggressive" },
        discover: { enabled: false },
        wellbeing: {
          breakPrompts: { enabled: false },
          maxNudgesPerDay: 6,
        },
      },
      user: {
        notifications: { mode: "minimal" },
        wellbeing: {
          maxNudgesPerDay: -1,
        },
      },
    });

    expect(policy.notifications.mode).toBe("minimal");
    expect(policy.discover.enabled).toBe(false);
    expect(policy.wellbeing.breakPrompts.enabled).toBe(false);
    expect(policy.wellbeing.maxNudgesPerDay).toBe(0);
  });
});
