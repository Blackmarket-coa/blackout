import { describe, expect, it } from "vitest";

import { renderMobileTabBar } from "../../src/components/MobileTabBar";

describe("renderMobileTabBar", () => {
  it("renders five mobile tabs with active state", () => {
    const html = renderMobileTabBar({ activeTab: "governance" });

    expect(html).toContain('data-action="mobile-tab"');
    expect(html).toContain('data-tab="home"');
    expect(html).toContain('data-tab="spaces"');
    expect(html).toContain('data-tab="search"');
    expect(html).toContain('data-tab="governance"');
    expect(html).toContain('data-tab="profile"');
    expect(html).toContain('mobile-tab is-active');
  });
});
