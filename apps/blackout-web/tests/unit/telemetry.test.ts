import { describe, expect, it, vi } from "vitest";

import { createTelemetryClient } from "../../src/services/telemetry";

describe("createTelemetryClient", () => {
  it("dispatches telemetry events with cohort and payload", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const telemetry = createTelemetryClient("beta");

    telemetry.track("preset_applied", { preset: "community_plus" });

    expect(dispatchSpy).toHaveBeenCalled();
    const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe("blackout:telemetry");
    expect((event.detail as { cohort: string }).cohort).toBe("beta");
    expect((event.detail as { name: string }).name).toBe("preset_applied");
  });
});
