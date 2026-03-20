import { describe, expect, it } from "vitest";

import { rankDiscoverCandidates } from "../../src/settings/discover";

describe("rankDiscoverCandidates", () => {
  it("returns bounded top 10 sorted candidates", () => {
    const candidates = Array.from({ length: 20 }, (_, index) => ({
      id: `item-${index}`,
      serverId: "s1",
      channelId: `c${index}`,
      signal: {
        relevance: 1 - (index * 0.03),
        socialProximity: 0.5,
        publishedAt: "2026-03-20T12:00:00Z",
      },
    }));

    const result = rankDiscoverCandidates(candidates, {
      now: "2026-03-20T12:30:00Z",
      limit: 10,
      page: 0,
    });

    expect(result).toHaveLength(10);
    expect(result[0]?.score).toBeGreaterThanOrEqual(result[1]?.score ?? 0);
  });
});
