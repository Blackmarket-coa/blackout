export type UUID = string;

export interface UserRecord {
  id: UUID;
  username: string;
  email: string;
  passwordHash: string;
  reputationScore: number;
  reputationTier: 'member' | 'vendor' | 'coordinator' | 'arbiter';
  pubkeyEd25519: string;
  createdAt: string;
}

export interface CommunityRecord {
  id: UUID;
  name: string;
  matrixRoomId?: string;
  description?: string;
  federationTier: 'local' | 'zone' | 'global';
  isBroadcast: boolean;
  createdAt: string;
}

export interface ChannelRecord {
  id: UUID;
  communityId: UUID;
  name: string;
  description?: string;
  channelType: 'text' | 'voice' | 'broadcast' | 'governance';
  isPrivate: boolean;
  matrixRoomId?: string;
  createdAt: string;
}

export interface MessageRecord {
  id: UUID;
  channelId: UUID;
  userId: UUID;
  content: string;
  governance?: { type: 'poll'; data: VoteRecord };
  contentStegoTier: 1 | 2 | 3;
  signature?: string;
  isEncrypted: boolean;
  encryptionAlgorithm?: string;
  createdAt: string;
}

export interface VoteRecord {
  id: UUID;
  communityId: UUID;
  proposerId: UUID;
  title: string;
  description?: string;
  voteType: 'yes_no' | 'ranked_choice' | 'weighted';
  options: Array<{ id: string; text: string }>;
  requiresQuorum: number;
  durationHours: number;
  status: 'active' | 'closed' | 'passed' | 'failed';
  startsAt: string;
  endsAt: string;
  createdAt: string;
}

export interface VoteEntryRecord {
  id: UUID;
  voteId: UUID;
  userId: UUID;
  choice: string;
  weight: number;
  createdAt: string;
}

export interface FederationLinkRecord {
  id: UUID;
  sourceCommunityId: UUID;
  targetCommunityId: UUID;
  linkType: 'zone' | 'alliance' | 'supply_chain';
  matrixBridgeRoomId: string;
  isActive: boolean;
  createdAt: string;
}


export interface ForumPostRecord {
  id: UUID;
  communityId: UUID;
  channelId?: UUID;
  authorId: UUID;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
}

export interface DeadDropRecord {
  id: UUID;
  channelId: UUID;
  senderId: UUID;
  recipientId: UUID;
  payload: string;
  openedAt?: string;
  createdAt: string;
}

export interface ModerationActionRecord {
  id: UUID;
  communityId: UUID;
  actorId: UUID;
  targetId: UUID;
  action: 'warn' | 'mute' | 'ban' | 'remove_content';
  reason: string;
  createdAt: string;
}

export interface CreatorStreamAuthRecord {
  id: UUID;
  creatorId: UUID;
  streamId: UUID;
  owncastUrl: string;
  streamKey: string;
  rotatedAt: string;
  createdAt: string;
}

export interface StreamRecord {
  id: UUID;
  creatorId: UUID;
  state: 'offline' | 'live';
  title: string;
  category?: string;
  tags: string[];
  visibility: 'public' | 'private' | 'member_only';
  allowedSubscriberIds: UUID[];
  latencyProfile: 'normal' | 'low';
  replayPointer?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StreamSessionRecord {
  id: UUID;
  streamId: UUID;
  startedAt: string;
  endedAt?: string;
  replayPointer?: string;
  createdAt: string;
}

export interface StreamModerationRecord {
  streamId: UUID;
  slowModeSeconds: number;
  bannedUserIds: UUID[];
  keywordFilters: string[];
  updatedAt: string;
}
