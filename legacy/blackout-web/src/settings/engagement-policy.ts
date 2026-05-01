import type { EngagementPolicy } from "../types";

export interface EngagementPolicyConfig {
  server?: Partial<EngagementPolicy>;
  user?: Partial<EngagementPolicy>;
}

export const DEFAULT_ENGAGEMENT_POLICY: EngagementPolicy = {
  notifications: {
    mode: "balanced",
  },
  discover: {
    enabled: true,
  },
  streaks: {
    enabled: false,
  },
  leaderboards: {
    enabled: false,
  },
  wellbeing: {
    breakPrompts: {
      enabled: true,
    },
    maxNudgesPerDay: 3,
  },
};

function mergePolicy(base: EngagementPolicy, overrides?: Partial<EngagementPolicy>): EngagementPolicy {
  if (!overrides) return { ...base };

  return {
    notifications: {
      ...base.notifications,
      ...overrides.notifications,
    },
    discover: {
      ...base.discover,
      ...overrides.discover,
    },
    streaks: {
      ...base.streaks,
      ...overrides.streaks,
    },
    leaderboards: {
      ...base.leaderboards,
      ...overrides.leaderboards,
    },
    wellbeing: {
      ...base.wellbeing,
      ...overrides.wellbeing,
      breakPrompts: {
        ...base.wellbeing.breakPrompts,
        ...overrides.wellbeing?.breakPrompts,
      },
    },
  };
}

export function resolveEngagementPolicy(config: EngagementPolicyConfig = {}): EngagementPolicy {
  const fromServer = mergePolicy(DEFAULT_ENGAGEMENT_POLICY, config.server);
  const fromUser = mergePolicy(fromServer, config.user);

  return {
    ...fromUser,
    wellbeing: {
      ...fromUser.wellbeing,
      maxNudgesPerDay: Math.max(0, Math.floor(fromUser.wellbeing.maxNudgesPerDay)),
    },
  };
}
