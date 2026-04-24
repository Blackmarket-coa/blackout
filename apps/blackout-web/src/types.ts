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
  capabilityTags?: ChannelCapabilityTag[];
}

export type ChannelCapabilityTag = "governance" | "economics" | "federation" | "townhall";

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
  deliveryStatus?: "sending" | "delivered" | "failed";
}

export interface GovernanceProposal {
  id: string;
  channelId: string;
  title: string;
  description: string;
  voteType: "simple_majority" | "supermajority" | "ranked_choice" | "approval";
  durationHours: number;
  quorum: number;
  status: "active" | "passed" | "rejected";
  createdAt: string;
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

export type CanopyAssetKind = "emoji" | "sticker" | "sound";
export type CanopyAssetStatus = "active" | "reported" | "removed";
export type CanopyPlan = "starter" | "governance" | "sovereignty";

export interface CanopyAsset {
  id: string;
  canopyId: string;
  kind: CanopyAssetKind;
  name: string;
  aliases: string[];
  sourceUrl: string;
  normalizedUrl: string;
  mimeType: string;
  sizeBytes: number;
  ownerUserId: string;
  memberOnly: boolean;
  abuseFlags: string[];
  status: CanopyAssetStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AssetAuditEntry {
  id: string;
  assetId: string;
  actorUserId: string;
  action: "upload" | "rename" | "alias_update" | "delete" | "report" | "remove";
  details: string;
  createdAt: string;
}
