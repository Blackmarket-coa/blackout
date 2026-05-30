import type {
  AidPost,
  CoalitionEvent,
  CoalitionFeedItem,
  CoalitionRing,
  CoalitionTask,
  EventRsvp,
  RideClaim,
  RideOffer,
  RingInvitation,
  RingMembership,
  SellerLocation,
  SpatialFeedItem,
  VolunteerSignup,
  VolunteerSlot,
} from '@blackout/core';
import type {
  ColiseumArgument,
  ColiseumLiveSession,
  ColiseumTopic,
  ColiseumVote,
  ReputationEventType,
  ReputationSubject,
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
 * A disposable "burner" Matrix identity an owner provisioned and can later
 * burn. The owner is the primary account that created it (the API JWT `sub`);
 * `burnerUserId` is the throwaway Synapse mxid. `burnedAt` is set when the
 * account is deactivated so the row remains as an audit trail.
 */
export interface BurnerIdentityRecord {
  id: UUID;
  /** Primary account that owns this burner (the only one allowed to burn it). */
  ownerUserId: string;
  /** The throwaway Synapse mxid (`@burn-xxxx:domain`). */
  burnerUserId: string;
  label: string;
  /** ISO 8601 timestamp after which the burner is considered expired. */
  expiresAt: string | null;
  /** ISO 8601 timestamp the burner was deactivated; null while active. */
  burnedAt: string | null;
  createdAt: string;
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
  | 'streamgoal.reached'
  | 'channelpoints.redeemed'
  | 'hypetrain.started'
  | 'hypetrain.ended';

/**
 * A creator-defined channel-points reward viewers redeem with points earned on
 * that creator's channel (the Twitch channel-points equivalent, Blackout-native).
 */
export interface ChannelPointsRewardRecord {
  id: UUID;
  /** The creator/channel that owns the reward. */
  creatorId: UUID;
  title: string;
  /** Points required to redeem. */
  cost: number;
  /** Optional prompt shown to the viewer (e.g. "name your song"). */
  prompt?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Append-only channel-points ledger. A viewer's balance on a channel is the
 * sum of `pointsDelta` over all rows for (channelId, userId) — earns are
 * positive, redemptions negative, refunds positive. No denormalized balance
 * table (mirrors the community-boost read-side aggregation pattern).
 */
export interface ChannelPointsLedgerRecord {
  id: UUID;
  /** The creator/channel the points belong to. */
  channelId: UUID;
  /** The viewer earning/spending. */
  userId: UUID;
  /** Signed: positive grant/refund, negative redemption. */
  pointsDelta: number;
  reason: 'grant' | 'redeem' | 'refund';
  /** Set on redeem/refund entries. */
  rewardId?: UUID;
  /** Reward title snapshot for redemption display. */
  rewardTitle?: string;
  /** Viewer's free-text input supplied at redemption. */
  userInput?: string;
  createdAt: string;
}

/**
 * A Twitch-extension-compat panel a creator has registered. Surfaces on all of
 * the creator's streams via the stream response `extensions[]`, and is rendered
 * in the livestream viewer's panel stack (see PR #756's ExtensionFrame).
 * `bundleUrl` is the extension JS the client sandbox fetches; `capabilities`
 * are the granted `twitch.ext.*` scopes.
 */
export interface TwitchExtensionPanelRecord {
  id: UUID;
  creatorId: UUID;
  label: string;
  bundleUrl: string;
  capabilities: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * A creator's marketplace listing record (metadata mirror of the core
 * `CreatorListing`). The artifact payload itself is not stored here — it is
 * handed to the marketplace provider at create time; this table only tracks the
 * sellable listing's lifecycle so it survives restarts.
 */
export interface CreatorListingRecord {
  id: UUID;
  providerId: string;
  providerListingId: string | null;
  sellerUserId: UUID;
  artifactKind: string;
  category: string;
  entitlementKind: string;
  title: string;
  description: string;
  priceCents: number;
  currency: string;
  status: string;
  feeBpsOverride?: number;
  publicSlug: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * An entry in a user's encrypted personal vault. The server stores only opaque
 * client-encrypted material (`ciphertext` + `iv`, base64) plus a plaintext
 * `label`; it never holds the key or plaintext.
 */
export interface VaultItemRecord {
  id: UUID;
  ownerUserId: UUID;
  label: string;
  ciphertext: string;
  iv: string;
  algo: string;
  createdAt: string;
  updatedAt: string;
}

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
  action: 'warn' | 'mute' | 'ban' | 'remove_content' | 'timeout' | 'slowmode';
  reason: string;
  /** Optional structured context (e.g. duration, device, failure reason). */
  metadata?: Record<string, unknown>;
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
  | 'channel_access'
  | 'profile_cosmetic'
  | 'sound_pack'
  | 'community_template'
  | 'stream_asset'
  | 'vault_item'
  | 'privacy_tool';

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

// --- FBM → Matrix bridge ------------------------------------------------------
// Persistent mappings the `fbmMatrixBridge` service maintains when translating
// FreeBlackMarket webhook events into Matrix room activity. Column names are the
// snake_case of these fields (the pg writer maps camelCase ↔ snake_case by
// reflection); see migrations 042–044.

/** One per FBM vendor: the bot-provisioned space + its orders/inventory/ledger rooms. */
export interface FbmVendorRoomRecord {
  /** FBM vendor id (primary key). */
  vendorId: string;
  spaceRoomId: string;
  ordersRoomId: string;
  inventoryRoomId: string;
  ledgerRoomId: string;
  createdAt: string;
}

/** A buyer-facing per-order room where order-status updates are pushed. */
export interface FbmBuyerOrderRoomRecord {
  id: UUID;
  vendorId: string;
  /** FBM userId (Blackout `sub`) of the buyer. */
  buyerUserId: string;
  /** FBM order id (unique). */
  orderId: string;
  roomId: string;
  createdAt: string;
}

/** A digital-product dead-drop delivery: a temporary room tombstoned after 72h / download. */
export interface FbmDeaddropDeliveryRecord {
  id: UUID;
  /** Originating webhook event id (unique) — DB-level replay idempotency. */
  sourceEventId: string;
  buyerUserId: string;
  entitlementId: string | null;
  roomId: string;
  dropId: string | null;
  clue: string | null;
  expiresAt: string;
  downloadedAt: string | null;
  tombstonedAt: string | null;
  createdAt: string;
}

/** A three-party encrypted dispute room; persists read-only for 90 days post-resolution. */
export interface FbmDisputeRoomRecord {
  /** FBM dispute id (primary key). */
  disputeId: string;
  orderId: string | null;
  vendorId: string;
  buyerUserId: string;
  mediatorUserId: string | null;
  roomId: string;
  status: 'open' | 'resolved';
  openedAt: string;
  resolvedAt: string | null;
  /** resolvedAt + retention window; the sweeper purges the room after this. */
  purgeAfter: string | null;
  purgedAt: string | null;
  createdAt: string;
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

// Creator-published kit manifests (Phase 4) — distinct from develop's curated
// in-tree coalition packs (`coalition_kit_applications`).
export interface CoalitionKitManifestApplicationRecord {
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

export interface PluginReviewRecord {
  id: UUID;
  pluginId: string;
  providerListingId: string | null;
  userId: string;
  rating: number;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface PluginForkRecord {
  id: UUID;
  pluginId: string;
  forkedFromPluginId: string;
  ownerUserId: string;
  note: string;
  createdAt: string;
}

export interface PluginShowcaseRecord {
  id: UUID;
  pluginId: string;
  userId: string;
  scopeType: string;
  scopeId: string;
  title: string;
  body: string;
  createdAt: string;
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

/** A scheduled Coalition event (gathering) surfaced on the map's 'events' layer. */
export interface CoalitionEventRecord extends CoalitionEvent {
  createdAt: string;
  updatedAt: string;
}

/** An attendee RSVP for a Coalition event. Keyed in-memory by `${eventId}::${userId}`. */
export interface EventRsvpRecord extends EventRsvp {
  createdAt: string;
  updatedAt: string;
}

/** A volunteer role on an event. */
export interface VolunteerSlotRecord extends VolunteerSlot {
  createdAt: string;
  updatedAt: string;
}

/** A volunteer signup. Keyed in-memory by `${slotId}::${userId}`. */
export interface VolunteerSignupRecord extends VolunteerSignup {
  createdAt: string;
  updatedAt: string;
}

/** A ride offer attached to an event. */
export interface RideOfferRecord extends RideOffer {
  createdAt: string;
  updatedAt: string;
}

/** A claimed seat on a ride offer. Keyed in-memory by `${offerId}::${riderId}`. */
export interface RideClaimRecord extends RideClaim {
  createdAt: string;
  updatedAt: string;
}

/** A Coalition Ring (circle/crew/guild). */
export interface CoalitionRingRecord extends CoalitionRing {
  createdAt: string;
  updatedAt: string;
}

/** A ring membership. Keyed in-memory by `${ringId}::${userId}`. */
export interface RingMembershipRecord extends RingMembership {
  createdAt: string;
  updatedAt: string;
}

/** A ring invitation. Keyed in-memory by `${ringId}::${inviteeId}`. */
export interface RingInvitationRecord extends RingInvitation {
  createdAt: string;
  updatedAt: string;
}

/** A record that a Coalition Kit was applied to a den/coalition scope. */
export interface CoalitionKitApplicationRecord {
  id: string;
  kitId: string;
  scopeType: string;
  scopeId: string;
  appliedByUserId: string;
  createdAt: string;
}

/** A Coalition den task. CoalitionTask already carries createdAt/updatedAt. */
export type CoalitionTaskRecord = CoalitionTask;

/** A seller's map location. Coordinates flatten to lat/lng columns in Postgres. */
export interface SellerLocationRecord extends SellerLocation {
  createdAt: string;
  updatedAt: string;
}

/** A ranked Coalition feed item (video/event/aid/listing/proposal). */
export interface CoalitionFeedItemRecord extends CoalitionFeedItem {
  updatedAt: string;
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

/**
 * A subject-scoped reputation award. Persisted so per-subject standing survives
 * a restart; `dedupeKey` (when present) makes an award idempotent and the dedupe
 * survives reloads too.
 */
export interface ReputationEventRecord {
  id: UUID;
  userId: UUID;
  type: ReputationEventType;
  subject?: ReputationSubject;
  points?: number;
  dedupeKey?: string;
  createdAt: string;
}
