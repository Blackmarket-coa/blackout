import { describe, expect, it } from "vitest";

import { renderDeepDivePanel } from "../../src/components/DeepDivePanel";

describe("renderDeepDivePanel", () => {
  it("renders swipe actions and bookmark counter", () => {
    const html = renderDeepDivePanel({ cardIndex: 1, bookmarked: 2 });

    expect(html).toContain('data-action="deepdive-dismiss"');
    expect(html).toContain('data-action="deepdive-join"');
    expect(html).toContain('data-action="deepdive-bookmark"');
    expect(html).toContain('data-testid="deepdive-bookmarked">2<');
  });

  it("renders optional AI recommendation affordances when enabled", () => {
    const html = renderDeepDivePanel({ cardIndex: 0, bookmarked: 0, aiRecommendationsEnabled: true });

    expect(html).toContain('data-testid="deepdive-ai-rec"');
    expect(html).toContain('data-action="deepdive-ai-explain"');
  });
});
