import { describe, expect, it } from "vitest";

import { renderMessageItem } from "../../src/components/MessageItem";

describe("renderMessageItem", () => {
  it("renders explicit delivery status inline", () => {
    const html = renderMessageItem({
      id: "m-100",
      sender: "Ari",
      body: "status check",
      timestamp: new Date("2026-04-05T12:00:00Z").toISOString(),
      deliveryStatus: "failed",
    });

    expect(html).toContain('message-delivery-status--failed');
    expect(html).toContain("Failed");
  });

  it("falls back to deterministic delivered status when not provided", () => {
    const html = renderMessageItem({
      id: "msg-11",
      sender: "Bex",
      body: "hello",
      timestamp: new Date("2026-04-05T12:00:00Z").toISOString(),
    });

    expect(html).toContain('data-testid="message-delivery-status"');
  });
});
