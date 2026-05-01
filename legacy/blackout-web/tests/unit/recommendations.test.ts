import { describe, expect, it } from "vitest";

import { scoreMeaningfulInteraction } from "../../src/settings/recommendations";

describe("scoreMeaningfulInteraction", () => {
  it("scores meaningful interaction probability without time-on-app objective", () => {
    const result = scoreMeaningfulInteraction({
      channelsVisited30d: 18,
      replyGraphAffinity: 0.8,
      mentionFrequency30d: 9,
    });

    expect(result.meaningfulInteractionProbability).toBeGreaterThan(0);
    expect(result.meaningfulInteractionProbability).toBeLessThanOrEqual(1);
  });
});
