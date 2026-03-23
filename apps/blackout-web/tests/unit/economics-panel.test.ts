import { describe, expect, it } from "vitest";

import { renderEconomicsPanel } from "../../src/components/EconomicsPanel";

describe("renderEconomicsPanel", () => {
  it("renders economics tabs and quest board surface", () => {
    const html = renderEconomicsPanel({
      channelLabel: "quest-board",
      activeTab: "quests",
    });

    expect(html).toContain('data-action="economics-set-tab" data-tab="boosts"');
    expect(html).toContain('data-action="economics-set-tab" data-tab="subscriptions"');
    expect(html).toContain('data-action="economics-set-tab" data-tab="quests"');
    expect(html).toContain('data-action="economics-set-tab" data-tab="marketplace"');
    expect(html).toContain('data-testid="economics-quests-view"');
  });
});
