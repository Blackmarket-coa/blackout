import { describe, expect, it } from "vitest";

import { nextRampStep, shouldRollbackExperiment } from "../../src/settings/experiments";

describe("engagement experiments", () => {
  it("supports predefined 1->5->20 ramp sequence", () => {
    expect(nextRampStep(1)).toBe(5);
    expect(nextRampStep(5)).toBe(20);
    expect(nextRampStep(20)).toBe(20);
  });

  it("rolls back when criteria is breached", () => {
    const shouldRollback = shouldRollbackExperiment(
      {
        id: "exp1",
        feature: "discover",
        holdoutPercentage: 20,
        rampStep: 5,
        rollback: [{ metric: "mute_rate", threshold: 0.15, direction: "above" }],
      },
      { mute_rate: 0.16 },
    );

    expect(shouldRollback).toBe(true);
  });
});
