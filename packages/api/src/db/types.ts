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

export type DeadmanSwitchStatus = 'armed' | 'grace' | 'triggered' | 'cancelled';

export interface DeadmanSwitchRecord {
  id: UUID;
  ownerId: UUID;
  roomId: string;
  status: DeadmanSwitchStatus;
  checkInIntervalSeconds: number;
  gracePeriodSeconds: number;
  lastCheckInAt: string;
  triggerAt: string;
  releaseAt: string;
  recipients: string[];
  encryptedPayload: string;
  headline?: string;
  createdAt: string;
  updatedAt: string;
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
export interface CanopyVoiceRoomRecord {
  id: UUID;
  canopyId: UUID;
  channelId: UUID;
  livekitRoomName: string;
  createdBy: UUID;
  isLocked: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceRoomParticipantRecord {
  id: UUID;
  roomId: UUID;
  userId: UUID;
  role: 'member' | 'moderator' | 'admin';
  canPublish: boolean;
  canSubscribe: boolean;
  joinedAt: string;
  leftAt?: string;
}

export interface VoiceRoomEventRecord {
  id: UUID;
  roomId: UUID;
  canopyId: UUID;
  channelId: UUID;
  userId: UUID;
  eventType: 'join' | 'leave' | 'mute' | 'remove' | 'lock' | 'unlock';
  actorId?: UUID;
  targetUserId?: UUID;
  sessionDurationSeconds?: number;
  metadata?: Record<string, string>;
  createdAt: string;
}

export type MarketplaceProviderIdString =
  | 'freeblackmarket'
  | 'blamazon'
  | 'mayhem-marketplaze'
  | 'antin-amazon';

export type MarketplaceEntitlementStatus =
  | 'granted'
  | 'pending'
  | 'refunded'
  | 'chargebacked'
  | 'revoked'
  | 'expired';

export type MarketplaceEntitlementKind =
  | 'emoji_pack'
  | 'asset_bundle'
  | 'software_license'
  | 'plugin_flag'
  | 'subscription_tier';

export interface MarketplaceEntitlementRecord {
  id: UUID;
  userId: string;
  providerId: MarketplaceProviderIdString;
  providerListingId: string;
  sku: string | null;
  kind: MarketplaceEntitlementKind;
  status: MarketplaceEntitlementStatus;
  grantedAt: string;
  expiresAt: string | null;
  sourceEventId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceWebhookAuditRecord {
  id: UUID;
  providerId: MarketplaceProviderIdString;
  eventId: string;
  receivedAt: string;
  processedAt: string | null;
  signatureOk: boolean;
  payload: unknown;
}

export interface MarketplaceLicenseKeyRecord {
  entitlementId: UUID;
  licenseKey: string;
  activationsUsed: number;
  activationsMax: number;
  createdAt: string;
}

export interface MarketplaceListingsCacheRecord {
  cacheKey: string;
  providerId: MarketplaceProviderIdString;
  listings: unknown[];
  refreshedAt: string;
}

export type CreatorSubscriptionTierStatus = 'draft' | 'active' | 'archived';

export interface CreatorSubscriptionTierRecord {
  id: UUID;
  creatorUserId: UUID;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  providerId: MarketplaceProviderIdString;
  fbmListingId: string | null;
  status: CreatorSubscriptionTierStatus;
  createdAt: string;
  updatedAt: string;
}

export type CreatorSubscriptionStatus =
  | 'pending'
  | 'active'
  | 'canceled'
  | 'refunded'
  | 'expired';

export interface CreatorSubscriptionRecord {
  id: UUID;
  subscriberUserId: UUID;
  creatorUserId: UUID;
  tierId: UUID;
  providerId: MarketplaceProviderIdString;
  fbmSubscriptionId: string | null;
  status: CreatorSubscriptionStatus;
  startedAt: string | null;
  currentPeriodEndsAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TipContextKind = 'profile' | 'stream' | 'post' | 'channel_message' | 'aid_pool';

export type TipStatus = 'pending' | 'captured' | 'refunded' | 'failed';

export interface TipRecord {
  id: UUID;
  senderUserId: UUID;
  recipientUserId: UUID;
  contextKind: TipContextKind;
  contextRef: string | null;
  grossCents: number;
  feeCents: number;
  netCents: number;
  currency: string;
  providerId: MarketplaceProviderIdString;
  fbmOrderId: string | null;
  status: TipStatus;
  note: string | null;
  createdAt: string;
  capturedAt: string | null;
  refundedAt: string | null;
}
