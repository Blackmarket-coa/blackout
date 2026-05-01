import { describe, expect, it, vi } from "vitest";

import { createSessionLengthBucket, createTelemetryClient } from "../../src/services/telemetry";

describe("createTelemetryClient", () => {
  it("dispatches telemetry events with cohort and payload", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const telemetry = createTelemetryClient("beta");

    telemetry.track("notification_sent", { feature: "presence_digest" });

    expect(dispatchSpy).toHaveBeenCalled();
    const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe("blackout:telemetry");
    expect((event.detail as { cohort: string }).cohort).toBe("beta");
    expect((event.detail as { name: string }).name).toBe("notification_sent");
  });

  it("buckets session length for wellbeing telemetry", () => {
    expect(createSessionLengthBucket(3)).toBe("0-5m");
    expect(createSessionLengthBucket(12)).toBe("5-15m");
    expect(createSessionLengthBucket(20)).toBe("15-30m");
    expect(createSessionLengthBucket(42)).toBe("30m+");
  });
});
