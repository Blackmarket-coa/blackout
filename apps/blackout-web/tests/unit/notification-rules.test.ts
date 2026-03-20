import { describe, expect, it } from "vitest";

import { evaluateNotificationCandidate } from "../../src/services/notification-rules";
import { DEFAULT_ENGAGEMENT_POLICY } from "../../src/settings/engagement-policy";
import type { NotificationRule } from "../../src/types";

const baseRule: NotificationRule = {
  feature: "presence_digest",
  category: "presence",
  hardCapPerDay: 3,
  cooldownMinutes: 120,
  quietHours: {
    startUtc: "22:00",
    endUtc: "07:00",
  },
};

describe("evaluateNotificationCandidate", () => {
  it("blocks engagement notifications in minimal mode", () => {
    const result = evaluateNotificationCandidate(
      {
        feature: "presence_digest",
        category: "presence",
        kind: "engagement",
        timestamp: new Date("2026-03-20T14:00:00Z"),
      },
      {
        ...DEFAULT_ENGAGEMENT_POLICY,
        notifications: { mode: "minimal" },
      },
      baseRule,
      {
        sentToday: 0,
        categoryMuted: false,
        lastSentAtByFeature: {},
      },
    );

    expect(result).toEqual({ allowed: false, reason: "policy_disabled" });
  });

  it("enforces cap, quiet hours, category mute, and cooldown", () => {
    expect(
      evaluateNotificationCandidate(
        {
          feature: "presence_digest",
          category: "presence",
          kind: "engagement",
          timestamp: new Date("2026-03-20T13:00:00Z"),
        },
        DEFAULT_ENGAGEMENT_POLICY,
        baseRule,
        {
          sentToday: 3,
          categoryMuted: false,
          lastSentAtByFeature: {},
        },
      ).reason,
    ).toBe("hard_cap");

    expect(
      evaluateNotificationCandidate(
        {
          feature: "presence_digest",
          category: "presence",
          kind: "engagement",
          timestamp: new Date("2026-03-20T23:00:00Z"),
        },
        DEFAULT_ENGAGEMENT_POLICY,
        baseRule,
        {
          sentToday: 0,
          categoryMuted: false,
          lastSentAtByFeature: {},
        },
      ).reason,
    ).toBe("quiet_hours");

    expect(
      evaluateNotificationCandidate(
        {
          feature: "presence_digest",
          category: "presence",
          kind: "engagement",
          timestamp: new Date("2026-03-20T14:00:00Z"),
        },
        DEFAULT_ENGAGEMENT_POLICY,
        baseRule,
        {
          sentToday: 0,
          categoryMuted: true,
          lastSentAtByFeature: {},
        },
      ).reason,
    ).toBe("category_muted");

    expect(
      evaluateNotificationCandidate(
        {
          feature: "presence_digest",
          category: "presence",
          kind: "engagement",
          timestamp: new Date("2026-03-20T14:00:00Z"),
        },
        DEFAULT_ENGAGEMENT_POLICY,
        baseRule,
        {
          sentToday: 0,
          categoryMuted: false,
          lastSentAtByFeature: {
            presence_digest: "2026-03-20T13:30:00Z",
          },
        },
      ).reason,
    ).toBe("cooldown");
  });

  it("allows transactional notifications through minimal mode", () => {
    const result = evaluateNotificationCandidate(
      {
        feature: "dm_invite",
        category: "inbox",
        kind: "transactional",
        timestamp: new Date("2026-03-20T14:00:00Z"),
      },
      {
        ...DEFAULT_ENGAGEMENT_POLICY,
        notifications: { mode: "minimal" },
      },
      {
        ...baseRule,
        feature: "dm_invite",
        category: "inbox",
      },
      {
        sentToday: 99,
        categoryMuted: false,
        lastSentAtByFeature: {},
      },
    );

    expect(result).toEqual({ allowed: true, reason: "allowed" });
  });
});
