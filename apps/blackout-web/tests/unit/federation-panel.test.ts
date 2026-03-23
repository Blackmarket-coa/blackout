import { describe, expect, it } from "vitest";

import { renderFederationPanel } from "../../src/components/FederationPanel";

describe("renderFederationPanel", () => {
  it("renders federation tabs and recovery view", () => {
    const html = renderFederationPanel({
      channelLabel: "federation-health",
      activeTab: "recovery",
    });

    expect(html).toContain('data-action="federation-set-tab" data-tab="health"');
    expect(html).toContain('data-action="federation-set-tab" data-tab="snapshots"');
    expect(html).toContain('data-action="federation-set-tab" data-tab="recovery"');
    expect(html).toContain('data-testid="federation-recovery-view"');
  });
});
