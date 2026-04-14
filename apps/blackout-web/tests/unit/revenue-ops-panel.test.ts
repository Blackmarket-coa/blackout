import { describe, expect, it } from "vitest";

import { renderRevenueOpsPanel } from "../../src/components/RevenueOpsPanel";

describe("renderRevenueOpsPanel", () => {
  it("renders monetization controls and payment sheet", () => {
    const html = renderRevenueOpsPanel({
      activeTab: "monetization",
      paymentSheetOpen: true,
      paymentIssue: true,
      questStage: "claimed",
      installedApps: 3,
      funnelMetrics: [
        { family: "stego", baselineUsage: 12, advancedControlOpens: 5, upgradeClicks: 2, conversions: 1 },
        { family: "governance", baselineUsage: 9, advancedControlOpens: 4, upgradeClicks: 3, conversions: 1 },
      ],
    });

    expect(html).toContain('data-action="revenue-tab" data-tab="monetization"');
    expect(html).toContain('data-action="revenue-open-payment-sheet"');
    expect(html).toContain('data-action="revenue-close-payment-sheet"');
    expect(html).toContain("Grace period active");
    expect(html).toContain('data-testid="revenue-funnel-slice"');
    expect(html).toContain('data-testid="funnel-row-stego"');
  });
});
