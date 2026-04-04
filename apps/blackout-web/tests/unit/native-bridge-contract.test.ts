import { describe, expect, it, vi } from "vitest";

import {
  dispatchNativeBridgeEvent,
  extractRoomIdFromDeepLinkUrl,
  listenForNativeBridgeEvents,
  type NativeBridgeEvent,
} from "../../src/platform/native-bridge-contract";

describe("native bridge parity smoke", () => {
  it("resolves room ids from deep-link urls", () => {
    expect(extractRoomIdFromDeepLinkUrl("blackout://room/!alpha:blackout.coop")).toBe("!alpha:blackout.coop");
    expect(extractRoomIdFromDeepLinkUrl("matrix://open?room_id=!beta:blackout.coop")).toBe("!beta:blackout.coop");
    expect(extractRoomIdFromDeepLinkUrl("https://example.com/room/123")).toBeNull();
  });

  it("emits unread count updates through the shared contract", () => {
    const seen: NativeBridgeEvent[] = [];
    const stop = listenForNativeBridgeEvents((event) => {
      seen.push(event);
    });

    dispatchNativeBridgeEvent({
      type: "unread_count_changed",
      source: "desktop",
      unread: 7,
    });

    stop();

    expect(seen).toEqual([
      {
        type: "unread_count_changed",
        source: "desktop",
        unread: 7,
      },
    ]);
  });

  it("routes notification interaction payloads with room ids", () => {
    const callback = vi.fn<(event: NativeBridgeEvent) => void>();
    const stop = listenForNativeBridgeEvents(callback);

    dispatchNativeBridgeEvent({
      type: "notification_interacted",
      source: "mobile",
      roomId: "!incident:blackout.coop",
    });

    stop();

    expect(callback).toHaveBeenCalledWith({
      type: "notification_interacted",
      source: "mobile",
      roomId: "!incident:blackout.coop",
    });
  });
});

