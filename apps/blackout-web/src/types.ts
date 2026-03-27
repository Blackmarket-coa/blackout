export interface Session {
  jwt: string;
  user: {
    id: string;
    username: string;
  };
}

export interface ServerSummary {
  id: string;
  name: string;
  role: string;
}

export interface ChannelSummary {
  id: string;
  name: string;
}

export interface ServerDetails {
  id: string;
  name: string;
  channels: ChannelSummary[];
}

export interface ChatMessage {
  id: string;
  sender: string;
  body: string;
  timestamp: string;
}

export type NotificationMode = "minimal" | "balanced" | "aggressive";

export interface EngagementPolicy {
  notifications: {
    mode: NotificationMode;
  };
  discover: {
    enabled: boolean;
  };
  streaks: {
    enabled: boolean;
  };
  leaderboards: {
    enabled: boolean;
  };
  wellbeing: {
    breakPrompts: {
      enabled: boolean;
    };
    maxNudgesPerDay: number;
  };
}

export interface NotificationRule {
  feature: string;
  category: string;
  hardCapPerDay: number;
  cooldownMinutes: number;
  quietHours?: {
    startUtc: string;
    endUtc: string;
  };
}

export interface DiscoverCandidate {
  id: string;
  serverId: string;
  channelId: string;
  reason: "relevance" | "recency" | "social_proximity";
  score: number;
}

export interface ReputationSnapshot {
  userId: string;
  serverId: string;
  streakDays: number;
  reputationScore: number;
  graceDaysRemaining: number;
  lastUpdatedAt: string;
}

export interface WellbeingState {
  userId: string;
  breakPromptsShownToday: number;
  breakPromptsAcceptedToday: number;
  breakPromptsDismissedToday: number;
  lastBreakPromptAt: string | null;
}
