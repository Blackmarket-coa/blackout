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
    });

    expect(html).toContain('data-action="revenue-tab" data-tab="monetization"');
    expect(html).toContain('data-action="revenue-open-payment-sheet"');
    expect(html).toContain('data-action="revenue-close-payment-sheet"');
    expect(html).toContain("Grace period active");
  });
});
