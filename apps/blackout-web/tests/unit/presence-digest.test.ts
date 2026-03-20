import { describe, expect, it } from "vitest";

import { buildPresenceDigest } from "../../src/services/presence-digest";

describe("buildPresenceDigest", () => {
  it("returns presence activities that fit the digest window", () => {
    const digest = buildPresenceDigest(
      [
        { userId: "u1", lastActiveAt: "2026-03-20T11:20:00Z" },
        { userId: "u2", lastActiveAt: "2026-03-20T08:00:00Z" },
      ],
      "2026-03-20T12:00:00Z",
      { digestWindowMinutes: 90 },
    );

    expect(digest.map((item) => item.userId)).toEqual(["u1"]);
  });
});
