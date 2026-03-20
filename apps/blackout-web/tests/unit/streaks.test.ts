import { describe, expect, it } from "vitest";

import { applySoftStreakUpdate } from "../../src/settings/streaks";

describe("applySoftStreakUpdate", () => {
  it("applies grace days before streak reset", () => {
    const next = applySoftStreakUpdate({
      policy: {
        enabled: true,
        graceDays: 2,
      },
      snapshot: {
        userId: "u1",
        serverId: "s1",
        streakDays: 8,
        reputationScore: 250,
        graceDaysRemaining: 2,
        lastUpdatedAt: "2026-03-17T10:00:00Z",
      },
      activityDate: "2026-03-20T10:00:00Z",
    });

    expect(next.streakDays).toBe(9);
    expect(next.graceDaysRemaining).toBe(0);

    const reset = applySoftStreakUpdate({
      policy: {
        enabled: true,
        graceDays: 2,
      },
      snapshot: next,
      activityDate: "2026-03-24T10:00:00Z",
    });

    expect(reset.streakDays).toBe(1);
  });
});
