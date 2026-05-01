import { describe, expect, it } from "vitest";

import { renderPlatformOpsPanel } from "../../src/components/PlatformOpsPanel";

describe("renderPlatformOpsPanel", () => {
  it("renders compliance controls", () => {
    const html = renderPlatformOpsPanel({
      activeTab: "compliance",
      readinessScore: 86,
      vaultUsageGb: 9.5,
      hostingTier: 2,
      blackboxProvisioned: false,
      recommendationMode: "heuristic",
    });

    expect(html).toContain('data-action="platform-tab" data-tab="compliance"');
    expect(html).toContain('data-action="compliance-toggle-secret-ballot"');
    expect(html).toContain('data-action="compliance-open-audit-log"');
    expect(html).toContain('data-action="compliance-generate-1099"');
  });
});
