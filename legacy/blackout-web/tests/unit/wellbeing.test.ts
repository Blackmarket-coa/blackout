import { describe, expect, it } from "vitest";

import { DEFAULT_ENGAGEMENT_POLICY } from "../../src/settings/engagement-policy";
import { buildReduceNotificationsAction, shouldShowBreakPrompt } from "../../src/settings/wellbeing";

describe("wellbeing policy", () => {
  it("blocks and allows break prompts based on thresholds", () => {
    const blocked = shouldShowBreakPrompt(
      DEFAULT_ENGAGEMENT_POLICY,
      {
        userId: "u1",
        breakPromptsShownToday: 0,
        breakPromptsAcceptedToday: 0,
        breakPromptsDismissedToday: 0,
        lastBreakPromptAt: null,
      },
      20,
      "2026-03-20T14:00:00Z",
    );

    expect(blocked.reason).toBe("session_threshold");

    const allowed = shouldShowBreakPrompt(
      DEFAULT_ENGAGEMENT_POLICY,
      {
        userId: "u1",
        breakPromptsShownToday: 1,
        breakPromptsAcceptedToday: 0,
        breakPromptsDismissedToday: 1,
        lastBreakPromptAt: "2026-03-20T10:00:00Z",
      },
      50,
      "2026-03-20T14:30:00Z",
    );

    expect(allowed.reason).toBe("prompt");
  });

  it("reduces notification nudges by 50%", () => {
    const reduced = buildReduceNotificationsAction({
      ...DEFAULT_ENGAGEMENT_POLICY,
      wellbeing: {
        ...DEFAULT_ENGAGEMENT_POLICY.wellbeing,
        maxNudgesPerDay: 6,
      },
    });

    expect(reduced.wellbeing.maxNudgesPerDay).toBe(3);
  });
});
