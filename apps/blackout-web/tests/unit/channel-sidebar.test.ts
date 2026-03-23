import { describe, expect, it } from "vitest";

import { renderChannelSidebar } from "../../src/components/ChannelSidebar";

describe("renderChannelSidebar", () => {
  it("assigns plan-aligned room kind classes and icons", () => {
    const html = renderChannelSidebar({
      serverName: "BMC",
      channels: [
        { id: "1", name: "general" },
        { id: "2", name: "voice-lobby" },
        { id: "3", name: "governance-votes" },
        { id: "4", name: "forum-feedback" },
        { id: "5", name: "announcements" },
      ],
      activeChannelId: "3",
      unreadByChannel: { "3": 4 },
    });

    expect(html).toContain("channel-kind--text");
    expect(html).toContain("channel-kind--voice");
    expect(html).toContain("channel-kind--governance");
    expect(html).toContain("channel-kind--forum");
    expect(html).toContain("channel-kind--announcement");
    expect(html).toContain("aria-label=\"Governance room: governance-votes\"");
    expect(html).toContain("<span class=\"badge\">4</span>");
  });
});
