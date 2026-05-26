import type { AidPost, SpatialFeedItem } from '@blackout/core';
import type {
  ColiseumArgument,
  ColiseumLiveSession,
  ColiseumTopic,
  ColiseumVote,
} from '@blackout/core';

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
  /** ISO timestamp the user verified the email on file. Unset = unverified. */
  /** ISO 8601 timestamp when the email was confirmed via a verification link. */
  emailVerifiedAt?: string;
}

export interface PasswordResetTokenRecord {
  id: UUID;
  userId: UUID;
  tokenHash: string;
  expiresAt: string;
  consumedAt?: string;
  createdAt: string;
  ipHash?: string;
  userAgentHash?: string;
}

export interface AccountDeletionTokenRecord {
  id: UUID;
  userId: UUID;
  tokenHash: string;
  expiresAt: string;
  consumedAt?: string;
  createdAt: string;
  ipHash?: string;
  userAgentHash?: string;
}

export interface EmailVerificationTokenRecord {
  id: UUID;
  userId: UUID;
  /** Email this token was issued for; pinned to detect email-change races. */
  email: string;
  tokenHash: string;
  expiresAt: string;
  /** ISO 8601 timestamp when the provider accepted the send. */
  sentAt?: string;
  /** ISO 8601 timestamp when the token was redeemed. */
  consumedAt?: string;
  /** Non-empty reason string when token was administratively revoked. */
  revokedReason?: string;
  createdAt: string;
  ipHash?: string;
  userAgentHash?: string;
}

/**
 * Shareable user invitation. The plaintext token is shown to the inviter
 * exactly once at creation time; only its SHA-256 hash is persisted, so a
 * DB leak does not yield usable invites. `maxUses` defaults to 1 (single-
 * use link); set higher for a multi-use code. When `matrixRoomId` is set,
 * successful redemption auto-invites the new account to that room.
 */
export interface InvitationTokenRecord {
  id: UUID;
  /** User id of the inviter; revocation is restricted to this account. */
  createdBy: UUID;
  tokenHash: string;
  /** Optional Matrix room id (e.g. `!abc:server`) the redeemer is invited into. */
  matrixRoomId?: string;
  /** Free-text label the inviter set for their own bookkeeping. */
  label?: string;
  maxUses: number;
  useCount: number;
  /** ISO 8601 timestamp after which the token is rejected. Unset = no expiry. */
  expiresAt?: string;
  /** ISO 8601 timestamp the inviter revoked the token. */
  revokedAt?: string;
  revokedReason?: string;
  createdAt: string;
  /**
   * Matching Synapse registration token (the value Synapse returned from
   * `POST /_synapse/admin/v1/registration_tokens/new`). Stored plaintext
   * because the revoke endpoint takes the literal token in the URL path
   * — we can't hash it and still revoke from Synapse. Synapse itself
   * stores these tokens in its own DB without hashing, so persisting it
   * here does not widen the existing trust boundary (anyone with DB
   * access to either side can already mint Matrix accounts).
   *
   * Never returned outside the original `POST /v1/invitations` create
   * response; the public preview and listing endpoints strip this field.
   */
  synapseRegistrationToken?: string;
  /** Synapse-reported expiry for the registration token (ISO 8601). */
  synapseRegistrationTokenExpiresAt?: string;
  /**
   * When true the link never exhausts (`maxUses`/`useCount` are ignored by
   * the exhaustion check). Used for reusable "personal" / bio share links
   * that many different people redeem over time.
   */
  unlimited?: boolean;
  /** Marks the single reusable per-user personal share link. */
  personal?: boolean;
  /**
   * Plaintext token, stored ONLY for personal links. Personal links are
   * public by design (pasted in a social bio), so we keep the plaintext to
   * return a stable URL on repeated get-or-create calls. They never grant
   * room access (no `matrixRoomId`); a leak only enables account creation +
   * a follow, which is exactly the intended public behaviour.
   */
  personalToken?: string;
}

/**
 * Audit row written each time an invitation is successfully redeemed. Lets
 * an inviter see who joined via each link and feeds the referral ledger.
 */
export interface InvitationRedemptionRecord {
  id: UUID;
  invitationTokenId: UUID;
  redeemedByUserId: UUID;
  /** Whether the room auto-invite succeeded (false if Matrix wasn't configured / errored). */
  matrixInviteOk?: boolean;
  createdAt: string;
}

export interface RefreshTokenRecord {
  id: UUID;
  userId: UUID;
  familyId: UUID;
  tokenHash: string;
  expiresAt: string;
  replacedBy?: UUID;
  revokedAt?: string;
  revokedReason?: string;
  createdAt: string;
  userAgentHash?: string;
}

export interface RevokedSessionRecord {
  jti: string;
  userId: UUID;
  revokedAt: string;
  expiresAt: string;
  reason: string;
}

/** Providers we link external identities for. Mirrors the `provider` column. */
export type LinkedAccountProvider =
  | 'twitch'
  | 'youtube'
  | 'discord'
  | 'patreon'
  | 'tiktok'
  | 'kick'
  | 'streamlabs';

export interface LinkedAccountRecord {
  id: UUID;
  blackoutUserId: UUID;
  provider: LinkedAccountProvider;
  providerUserId: string;
  providerUsername?: string;
  /** AES-256-GCM envelope; see services/secretBox.ts. */
  accessTokenCiphertext: string;
  /** AES-256-GCM envelope; null for providers that do not issue refresh tokens. */
  refreshTokenCiphertext?: string;
  scopes: string[];
  /** ISO 8601 timestamp when the access token expires (omitted = unknown / non-expiring). */
  expiresAt?: string;
  encryptionKeyId: string;
  /**
   * Generic per-link "last seen" marker for polling-style integrations.
   * Streamlabs donation sync stores the largest donation_id processed so
   * far; a future YouTube live-chat poller would store its nextPageToken;
   * Patreon backfill would store the JSON:API `next` cursor; etc.
   *
   * Persisted across restarts so a cold boot doesn't replay stale events.
   */
  syncCursor?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PendingOAuthLinkRecord {
  /** SHA-256 hex of the random state token presented in the OAuth redirect. */
  stateHash: string;
  blackoutUserId: UUID;
  provider: LinkedAccountProvider;
  /** AES-256-GCM envelope of the PKCE code_verifier. */
  codeVerifierCiphertext: string;
  redirectUri: string;
  scopes: string[];
  encryptionKeyId: string;
  expiresAt: string;
  consumedAt?: string;
  createdAt: string;
}

export interface TwitchChatBridgeRecord {
  id: UUID;
  blackoutUserId: UUID;
  /** Lowercased Twitch channel login (without leading '#'). */
  twitchChannel: string;
  /** Matrix room id, e.g. `!roomid:server`. */
  matrixRoomId: string;
  isActive: boolean;
  lastStoppedAt?: string;
  lastStoppedReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SimulcastDestinationRecord {
  id: UUID;
  blackoutUserId: UUID;
  /** Short provider label: 'twitch' / 'youtube' / 'kick' / etc. */
  provider: string;
  label?: string;
  /** Public RTMP/RTMPS URL the fan-out worker pushes to. */
  ingestUrl: string;
  /** AES-256-GCM envelope of the stream key (services/secretBox.ts format). */
  streamKeyCiphertext: string;
  encryptionKeyId: string;
  isEnabled: boolean;
  lastUsedAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface YoutubeChatBridgeRecord {
  id: UUID;
  blackoutUserId: UUID;
  /** YouTube channel id (UCxxxx...) of the broadcaster being bridged. */
  youtubeChannelId: string;
  /** Matrix room id, e.g. `!roomid:server`. */
  matrixRoomId: string;
  isActive: boolean;
  lastStoppedAt?: string;
  lastStoppedReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KickChatBridgeRecord {
  id: UUID;
  blackoutUserId: UUID;
  /** Kick numeric chatroom id (stored as a string to dodge int overflow). */
  kickChatroomId: string;
  matrixRoomId: string;
  isActive: boolean;
  lastStoppedAt?: string;
  lastStoppedReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiscordCompatWebhookRecord {
  id: UUID;
  blackoutUserId: UUID;
  matrixRoomId: string;
  /** Display label only (e.g. "GitHub", "Sentry"). Discord-style senders pick their own per-call. */
  name: string;
  avatarUrl?: string;
  /** sha256 of the URL token. Plaintext is only ever returned at create time. */
  tokenHash: string;
  isActive: boolean;
  lastUsedAt?: string;
  deliveryCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Outbound Discord-shape webhook subscription. Creator registers a URL
 * (Discord's own webhook URL, Zapier, IFTTT, custom backend) and we POST
 * Blackout events to it in Discord embed shape, signed with a shared HMAC
 * secret.
 */
export type OutboundEventType =
  | 'tip.created'
  | 'follow.created'
  | 'livestream.started'
  | 'livestream.ended'
  | 'chat.message.received'
  | 'subscriber.created'
  | 'subscriber.gifted'
  | 'cheer.received'
  | 'raid.received'
  | 'streamgoal.reached';

export interface ObsWsPasswordRecord {
  id: UUID;
  blackoutUserId: UUID;
  label?: string;
  /**
   * AES-256-GCM envelope of the plaintext password. AAD =
   * `obs_ws_password|${id}` so a leaked envelope can't be replayed
   * against another row.
   */
  passwordCiphertext: string;
  encryptionKeyId: string;
  isActive: boolean;
  revokedAt?: string;
  revokeReason?: string;
  lastUsedAt?: string;
  useCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TwitchIrcBotTokenRecord {
  id: UUID;
  blackoutUserId: UUID;
  label?: string;
  /** sha256 of the bearer secret. Plaintext is never persisted. */
  secretHash: string;
  /** Channel scope: empty array = "all channels owned by this creator". */
  scopes: string[];
  isActive: boolean;
  revokedAt?: string;
  revokeReason?: string;
  lastUsedAt?: string;
  useCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OutboundEventWebhookRecord {
  id: UUID;
  blackoutUserId: UUID;
  name: string;
  targetUrl: string;
  /**
   * AES-256-GCM envelope of the HMAC signing secret (services/secretBox.ts
   * format). The AAD binds it to (subscriptionId) so a leaked envelope
   * can't be replayed against another row.
   */
  signingSecretCiphertext: string;
  encryptionKeyId: string;
  /** Subset of OutboundEventType. Empty array means "all". */
  eventTypes: OutboundEventType[];
  isActive: boolean;
  consecutiveFailures: number;
  lastDeliveryAt?: string;
  lastStatus?: number;
  lastError?: string;
  deliveryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TwitchEventSubscriptionRecord {
  id: UUID;
  blackoutUserId: UUID;
  /** Numeric Twitch user id of the broadcaster being watched. */
  twitchUserId: string;
  /** EventSub subscription type, e.g. `channel.follow`. */
  subscriptionType: string;
  /** The subscription id Twitch returned from POST /eventsub/subscriptions. */
  helixSubscriptionId: string;
  /** Mirrors Twitch's `status` field. */
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface WidgetAlertTokenRecord {
  id: UUID;
  blackoutUserId: UUID;
  /** Optional human label, e.g. "Main OBS". */
  label?: string;
  /** SHA-256 hex of the bearer secret. Plaintext is never persisted. */
  secretHash: string;
  scopes: string[];
  createdAt: string;
  revokedAt?: string;
  revokedReason?: string;
  /** Diagnostics: most recent SSE delivery to this token. */
  lastDeliveredAt?: string;
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

export interface CanopyDirectoryEntryRecord {
  canopyId: string;
  name: string;
  summary?: string;
  federationTier: 'local' | 'zone' | 'global';
  indexedAt: string;
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

export type ScheduledMessageStatus = 'pending' | 'delivered' | 'failed' | 'cancelled';

export interface ScheduledMessageRecord {
  id: UUID;
  /** Blackout user id of the author (resolved from the authenticated session). */
  userId: UUID;
  matrixRoomId: string;
  body: string;
  formattedBody?: string;
  /** ISO timestamp the message becomes due for delivery. */
  deliverAt: string;
  status: ScheduledMessageStatus;
  /** Number of delivery attempts the dispatcher has made. */
  attempts: number;
  lastError?: string;
  createdAt: string;
  deliveredAt?: string;
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
  /**
   * Optional den (Matrix room) the stream is associated with. When set,
   * the LivestreamViewer surfaces a CTA into that den's chat so viewers
   * can join the conversation without leaving the viewer route.
   */
  denId?: UUID;
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

export interface ClipRecord {
  id: UUID;
  creatorId: UUID;
  /** Source stream this clip was cut from, when applicable. */
  sourceStreamId?: UUID;
  title: string;
  /** mxc:// or HLS pointer to the clip media. */
  mediaPointer: string;
  /** Optional poster/thumbnail pointer. */
  thumbnailPointer?: string;
  durationSeconds: number;
  visibility: 'public' | 'private' | 'member_only';
  tags: string[];
  createdAt: string;
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
  | 'subscription_tier'
  | 'post_unlock'
  | 'event_ticket'
  | 'role_grant'
  | 'channel_access';

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

export type PluginInstallScopeType = 'user' | 'den' | 'coalition' | 'creator';

export type PluginInstallStatus =
  | 'enabled'
  | 'disabled'
  | 'available'
  | 'pending'
  | 'error';

export interface PluginInstallationRecord {
  id: UUID;
  pluginId: string;
  entitlementId: UUID | null;
  scopeType: PluginInstallScopeType;
  scopeId: string;
  installedByUserId: string;
  status: PluginInstallStatus;
  artifactKind: string;
  domain: string | null;
  grantedCapabilities: string[];
  config: Record<string, unknown>;
  manifest: Record<string, unknown>;
  installedAt: string;
  updatedAt: string;
}

export interface PluginDenRecord {
  id: UUID;
  installationId: UUID;
  pluginId: string;
  denId: string;
  purpose: string;
  denType: string;
  name: string;
  createdAt: string;
}

export interface CoalitionKitApplicationRecord {
  id: UUID;
  coalitionId: string;
  kitId: string;
  appliedByUserId: string;
  archetype: string;
  customization: Record<string, unknown>;
  denIds: string[];
  bundledPluginIds: string[];
  status: 'applied' | 'reverted';
  createdAt: string;
  updatedAt: string;
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

export type CommunityBoostPledgeStatus =
  | 'pending'
  | 'active'
  | 'canceled'
  | 'refunded'
  | 'expired';

export type AidPoolStatus = 'open' | 'fulfilled' | 'closed';

export interface AidPoolRecord {
  id: UUID;
  organizerUserId: UUID;
  title: string;
  description: string | null;
  goalCents: number;
  currency: string;
  status: AidPoolStatus;
  createdAt: string;
  fulfilledAt: string | null;
  closedAt: string | null;
}

export type AdRevenuePeriodStatus = 'draft' | 'allocated' | 'paid' | 'closed';

export interface AdRevenuePeriodRecord {
  id: UUID;
  periodStart: string;
  periodEnd: string;
  totalCents: number;
  currency: string;
  status: AdRevenuePeriodStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AdRevenueShareStatus = 'pending_payout' | 'paid' | 'voided';

export interface AdRevenueShareRecord {
  id: UUID;
  periodId: UUID;
  creatorUserId: UUID;
  grossCents: number;
  feeCents: number;
  netCents: number;
  currency: string;
  providerId: MarketplaceProviderIdString;
  fbmPayoutId: string | null;
  status: AdRevenueShareStatus;
  computedAt: string;
  paidAt: string | null;
}

export interface CommunityBoostPledgeRecord {
  id: UUID;
  communityId: UUID;
  pledgerUserId: UUID;
  monthlyCents: number;
  feeCents: number;
  netCents: number;
  currency: string;
  providerId: MarketplaceProviderIdString;
  fbmSubscriptionId: string | null;
  status: CommunityBoostPledgeStatus;
  startedAt: string | null;
  currentPeriodEndsAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TipContextKind =
  | 'profile'
  | 'stream'
  | 'post'
  | 'channel_message'
  | 'aid_pool'
  | 'referral_bonus'
  | 'ambassador_commission'
  | 'quest_reward';

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
  giftSku: string | null;
  createdAt: string;
  capturedAt: string | null;
  refundedAt: string | null;
  metadata?: Record<string, unknown>;
}

/** A pin on the Coalition spatial map (events, dens, streams, aid, vendors, …). */
export interface CoalitionSpatialItemRecord extends SpatialFeedItem {
  createdAt: string;
  updatedAt: string;
}

/** A durable mutual-aid request/offer surfaced on the Coalition map. */
export interface CoalitionAidPostRecord extends AidPost {
  createdAt: string;
}

/**
 * Coliseum debate records. These persist the discourse layer (topics,
 * arguments, votes, live sessions) so debate history survives a restart. The
 * shapes are the canonical core types; denormalized scores (voteScore,
 * nuanceScore, debateHeat) are stored on the records and recomputed by the
 * coliseum service on each write.
 */
export type ColiseumTopicRecord = ColiseumTopic;
export type ColiseumArgumentRecord = ColiseumArgument;
export type ColiseumVoteRecord = ColiseumVote;
export type ColiseumLiveSessionRecord = ColiseumLiveSession;
