import { describe, expect, it } from "vitest";

import { extractDirectMessageDisplayName, getDirectMessageChannels, isDirectMessageChannelName } from "../../src/utils/dm-channel";

describe("isDirectMessageChannelName", () => {
  it("matches common DM naming prefixes", () => {
    expect(isDirectMessageChannelName("dm-alex")).toBe(true);
    expect(isDirectMessageChannelName("direct jamie")).toBe(true);
    expect(isDirectMessageChannelName("pm_sam")).toBe(true);
    expect(isDirectMessageChannelName("whisper-maya")).toBe(true);
    expect(isDirectMessageChannelName("1:1 robin")).toBe(true);
    expect(isDirectMessageChannelName("@maya:blackout.local")).toBe(true);
  });

  it("ignores non-DM channel names", () => {
    expect(isDirectMessageChannelName("general")).toBe(false);
    expect(isDirectMessageChannelName("random")).toBe(false);
    expect(isDirectMessageChannelName("product-directives")).toBe(false);
    expect(isDirectMessageChannelName("  ")).toBe(false);
  });
});

describe("extractDirectMessageDisplayName", () => {
  it("extracts a readable name from DM-prefixed channels", () => {
    expect(extractDirectMessageDisplayName("dm-alex")).toBe("alex");
    expect(extractDirectMessageDisplayName("pm sam")).toBe("sam");
    expect(extractDirectMessageDisplayName("direct")).toBe("Direct message");
  });
});

describe("getDirectMessageChannels", () => {
  it("returns DM channels sorted by unread count, then display name", () => {
    const channels = [
      { id: "c1", name: "general" },
      { id: "c2", name: "pm-zane" },
      { id: "c3", name: "dm-alex" },
      { id: "c4", name: "@maya:blackout.local" },
    ];

    const result = getDirectMessageChannels(channels, {
      c2: 1,
      c3: 4,
      c4: 4,
    });

    expect(result.map((entry) => entry.channel.id)).toEqual(["c4", "c3", "c2"]);
    expect(result.map((entry) => entry.displayName)).toEqual(["@maya:blackout.local", "alex", "zane"]);
  });
});
