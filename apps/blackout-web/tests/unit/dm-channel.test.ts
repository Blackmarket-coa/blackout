import { describe, expect, it } from "vitest";

import { isDirectMessageChannelName } from "../../src/utils/dm-channel";

describe("isDirectMessageChannelName", () => {
  it("matches common DM naming prefixes", () => {
    expect(isDirectMessageChannelName("dm-alex")).toBe(true);
    expect(isDirectMessageChannelName("direct jamie")).toBe(true);
    expect(isDirectMessageChannelName("pm_sam")).toBe(true);
    expect(isDirectMessageChannelName("whisper-maya")).toBe(true);
    expect(isDirectMessageChannelName("1:1 robin")).toBe(true);
  });

  it("ignores non-DM channel names", () => {
    expect(isDirectMessageChannelName("general")).toBe(false);
    expect(isDirectMessageChannelName("random")).toBe(false);
    expect(isDirectMessageChannelName("product-directives")).toBe(false);
    expect(isDirectMessageChannelName("  ")).toBe(false);
  });
});
