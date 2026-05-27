// Per-table descriptors + per-mutator write-through specs for PostgresBackedDb.
//
// Most tables are regular: table name = snake_case(mapName), keyed by `id`,
// reflection maps fields ↔ columns. The exceptions (composite/non-id keys, the
// renamed webhook-audit table, and the nested coalition-aid location) are
// declared explicitly. The MUTATOR_SPECS table says, for each of the 123
// InMemoryDb mutators, whether a write-through is a targeted upsert of the
// returned record or a (rarer) resync of the affected map(s).

import { camelToSnake, type Row, type TableDescriptor } from './pgWriter';

const KEY_ID = (r: Record<string, unknown>) => String(r.id);

/** Tables whose in-memory key or table name differs from the regular defaults. */
interface DescriptorOverride {
  tableName?: string;
  keyOf?: (r: Record<string, unknown>) => string;
  conflictColumns?: string[];
  toRow?: (r: Record<string, unknown>) => Row;
  fromRow?: (r: Row) => Record<string, unknown>;
}

const OVERRIDES: Record<string, DescriptorOverride> = {
  streamModeration: { keyOf: (r) => String(r.streamId), conflictColumns: ['stream_id'] },
  marketplaceWebhookAudit: {
    tableName: 'marketplace_webhook_events',
    keyOf: (r) => `${r.providerId}:${r.eventId}`,
    conflictColumns: ['provider_id', 'event_id'],
  },
  marketplaceLicenseKeys: {
    keyOf: (r) => String(r.entitlementId),
    conflictColumns: ['entitlement_id'],
  },
  marketplaceListingsCache: { keyOf: (r) => String(r.cacheKey), conflictColumns: ['cache_key'] },
  revokedSessions: { keyOf: (r) => String(r.jti), conflictColumns: ['jti'] },
  linkedAccounts: {
    keyOf: (r) => `${r.blackoutUserId}:${r.provider}`,
    conflictColumns: ['blackout_user_id', 'provider'],
  },
  pendingOAuthLinks: {
    tableName: 'pending_oauth_links',
    keyOf: (r) => String(r.stateHash),
    conflictColumns: ['state_hash'],
  },
  twitchEventSubscriptions: {
    keyOf: (r) => String(r.helixSubscriptionId),
    conflictColumns: ['helix_subscription_id'],
  },
  widgetAlertTokens: { keyOf: (r) => String(r.secretHash), conflictColumns: ['secret_hash'] },
  canopyDirectoryEntries: { keyOf: (r) => String(r.canopyId), conflictColumns: ['canopy_id'] },
  coliseumVotes: {
    keyOf: (r) => `${r.argumentId}::${r.voterId}`,
    conflictColumns: ['argument_id', 'voter_id'],
  },
  eventRsvps: {
    keyOf: (r) => `${r.eventId}::${r.userId}`,
    conflictColumns: ['event_id', 'user_id'],
  },
  eventVolunteerSignups: {
    keyOf: (r) => `${r.slotId}::${r.userId}`,
    conflictColumns: ['slot_id', 'user_id'],
  },
  eventRideClaims: {
    keyOf: (r) => `${r.offerId}::${r.riderId}`,
    conflictColumns: ['offer_id', 'rider_id'],
  },
  ringMemberships: {
    keyOf: (r) => `${r.ringId}::${r.userId}`,
    conflictColumns: ['ring_id', 'user_id'],
  },
  ringInvitations: {
    keyOf: (r) => `${r.ringId}::${r.inviteeId}`,
    conflictColumns: ['ring_id', 'invitee_id'],
  },
  // coalition_rings flattens the optional nested location into lat/lng/address.
  coalitionRings: {
    toRow: (r) => {
      const loc = (r.location ?? {}) as { latitude?: number; longitude?: number; address?: string };
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        kind: r.kind,
        visibility: r.visibility,
        owner_id: r.ownerId,
        latitude: loc.latitude ?? null,
        longitude: loc.longitude ?? null,
        address: loc.address ?? null,
        den_id: r.denId ?? null,
        created_at: r.createdAt,
        updated_at: r.updatedAt,
      };
    },
    fromRow: (row) => {
      const rec: Record<string, unknown> = {
        id: row.id,
        name: row.name,
        description: row.description,
        kind: row.kind,
        visibility: row.visibility,
        ownerId: row.owner_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      if (row.latitude != null && row.longitude != null) {
        rec.location = {
          latitude: row.latitude,
          longitude: row.longitude,
          ...(row.address != null ? { address: row.address } : {}),
        };
      }
      if (row.den_id != null) rec.denId = row.den_id;
      return rec;
    },
  },
  // coalition_events flattens the nested location into lat/lng/address columns.
  coalitionEvents: {
    toRow: (r) => {
      const loc = (r.location ?? {}) as { latitude?: number; longitude?: number; address?: string };
      return {
        id: r.id,
        organizer_id: r.organizerId,
        title: r.title,
        description: r.description,
        latitude: loc.latitude,
        longitude: loc.longitude,
        address: loc.address ?? null,
        starts_at: r.startsAt,
        ends_at: r.endsAt ?? null,
        category: r.category,
        visibility: r.visibility,
        status: r.status,
        den_id: r.denId ?? null,
        capacity: r.capacity ?? null,
        recurrence: r.recurrence ?? null,
        created_at: r.createdAt,
        updated_at: r.updatedAt,
      };
    },
    fromRow: (row) => {
      const rec: Record<string, unknown> = {
        id: row.id,
        organizerId: row.organizer_id,
        title: row.title,
        description: row.description,
        location: {
          latitude: row.latitude,
          longitude: row.longitude,
          ...(row.address != null ? { address: row.address } : {}),
        },
        startsAt: row.starts_at,
        category: row.category,
        visibility: row.visibility,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      if (row.ends_at != null) rec.endsAt = row.ends_at;
      if (row.den_id != null) rec.denId = row.den_id;
      if (row.capacity != null) rec.capacity = row.capacity;
      if (row.recurrence != null) rec.recurrence = row.recurrence;
      return rec;
    },
  },
  // seller_locations flattens the nested SellerLocation.coordinates into lat/lng columns.
  sellerLocations: {
    toRow: (r) => {
      const coords = (r.coordinates ?? {}) as { latitude?: number; longitude?: number };
      return {
        id: r.id,
        seller_id: r.sellerId,
        latitude: coords.latitude,
        longitude: coords.longitude,
        address_line: r.addressLine,
        city: r.city,
        state: r.state,
        zip: r.zip,
        country: r.country,
        display_radius_meters: r.displayRadiusMeters,
        is_visible: r.isVisible,
        location_type: r.locationType,
        created_at: r.createdAt,
        updated_at: r.updatedAt,
      };
    },
    fromRow: (row) => ({
      id: row.id,
      sellerId: row.seller_id,
      coordinates: { latitude: row.latitude, longitude: row.longitude },
      addressLine: row.address_line,
      city: row.city,
      state: row.state,
      zip: row.zip,
      country: row.country,
      displayRadiusMeters: row.display_radius_meters,
      isVisible: row.is_visible,
      locationType: row.location_type,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  },
  // coalition_aid_posts flattens the nested AidPost.location into lat/lng/address columns.
  coalitionAidPosts: {
    toRow: (r) => {
      const loc = (r.location ?? {}) as { latitude?: number; longitude?: number; address?: string };
      return {
        id: r.id,
        customer_id: r.customerId,
        type: r.type,
        category: r.category,
        title: r.title,
        description: r.description,
        latitude: loc.latitude,
        longitude: loc.longitude,
        address: loc.address ?? null,
        display_radius_meters: r.displayRadiusMeters,
        urgency: r.urgency,
        status: r.status,
        expires_at: r.expiresAt ?? null,
        fulfiller_id: r.fulfillerId ?? null,
        fulfilled_at: r.fulfilledAt ?? null,
        den_id: r.denId ?? null,
        metadata: r.metadata ?? null,
        created_at: r.createdAt,
      };
    },
    fromRow: (row) => {
      const rec: Record<string, unknown> = {
        id: row.id,
        customerId: row.customer_id,
        type: row.type,
        category: row.category,
        title: row.title,
        description: row.description,
        location: {
          latitude: row.latitude,
          longitude: row.longitude,
          ...(row.address != null ? { address: row.address } : {}),
        },
        displayRadiusMeters: row.display_radius_meters,
        urgency: row.urgency,
        status: row.status,
        createdAt: row.created_at,
      };
      if (row.expires_at != null) rec.expiresAt = row.expires_at;
      if (row.fulfiller_id != null) rec.fulfillerId = row.fulfiller_id;
      if (row.fulfilled_at != null) rec.fulfilledAt = row.fulfilled_at;
      if (row.den_id != null) rec.denId = row.den_id;
      if (row.metadata != null) rec.metadata = row.metadata;
      return rec;
    },
  },
};

/** Every store map, in the order they should hydrate. */
const ALL_MAP_NAMES = [
  'users',
  'messages',
  'scheduledMessages',
  'votes',
  'voteEntries',
  'federationLinks',
  'forumPosts',
  'deadDrops',
  'deadmanSwitches',
  'moderationActions',
  'creatorStreamAuth',
  'streams',
  'streamSessions',
  'streamModeration',
  'canopyVoiceRooms',
  'voiceRoomParticipants',
  'voiceRoomEvents',
  'marketplaceEntitlements',
  'marketplaceWebhookAudit',
  'marketplaceLicenseKeys',
  'marketplaceListingsCache',
  'tips',
  'creatorSubscriptionTiers',
  'creatorSubscriptions',
  'communityBoostPledges',
  'aidPools',
  'adRevenuePeriods',
  'adRevenueShares',
  'passwordResetTokens',
  'emailVerificationTokens',
  'accountDeletionTokens',
  'invitationTokens',
  'invitationRedemptions',
  'refreshTokens',
  'revokedSessions',
  'linkedAccounts',
  'pendingOAuthLinks',
  'twitchChatBridges',
  'twitchEventSubscriptions',
  'widgetAlertTokens',
  'youtubeChatBridges',
  'kickChatBridges',
  'simulcastDestinations',
  'discordCompatWebhooks',
  'outboundEventWebhooks',
  'twitchIrcBotTokens',
  'obsWsPasswords',
  'twitchExtensionPanels',
  'coalitionSpatialItems',
  'coalitionAidPosts',
  'coalitionEvents',
  'eventRsvps',
  'eventVolunteerSlots',
  'eventVolunteerSignups',
  'eventRideOffers',
  'eventRideClaims',
  'coalitionRings',
  'ringMemberships',
  'ringInvitations',
  'coalitionKitApplications',
  'coalitionTasks',
  'sellerLocations',
  'coalitionFeedItems',
  'canopyDirectoryEntries',
  'clips',
  'coliseumTopics',
  'coliseumArguments',
  'coliseumVotes',
  'coliseumLiveSessions',
  'pluginInstallations',
  'reputationEvents',
  'pluginDens',
  'coalitionKitManifestApplications',
  'pluginReviews',
  'pluginForks',
  'pluginShowcases',
] as const;

export const TABLE_DESCRIPTORS: TableDescriptor[] = ALL_MAP_NAMES.map((mapName) => {
  const ov = OVERRIDES[mapName] ?? {};
  return {
    mapName,
    tableName: ov.tableName ?? camelToSnake(mapName),
    keyOf: ov.keyOf ?? KEY_ID,
    conflictColumns: ov.conflictColumns ?? ['id'],
    toRow: ov.toRow,
    fromRow: ov.fromRow,
  };
});

export type MutatorSpec =
  | { kind: 'upsert'; map: string }
  | { kind: 'resync'; maps: string[] };

const upsert = (map: string): MutatorSpec => ({ kind: 'upsert', map });
const resync = (...maps: string[]): MutatorSpec => ({ kind: 'resync', maps });

/**
 * Maps each of the 123 InMemoryDb mutators to its write-through. `upsert`
 * persists the method's returned record; `resync` reconciles a map after a
 * delete / bulk-revoke / consume. The 6 `reset*ForTest` seams are intentionally
 * absent — postgres mode never calls them.
 */
export const MUTATOR_SPECS: Record<string, MutatorSpec> = {
  createUser: upsert('users'),
  updateUserPassword: upsert('users'),
  markUserEmailVerified: upsert('users'),
  deleteUser: resync('users'),
  createScheduledMessage: upsert('scheduledMessages'),
  markScheduledMessageDelivered: upsert('scheduledMessages'),
  markScheduledMessageFailed: upsert('scheduledMessages'),
  cancelScheduledMessage: upsert('scheduledMessages'),
  createPasswordResetToken: upsert('passwordResetTokens'),
  consumePasswordResetToken: resync('passwordResetTokens'),
  createEmailVerificationToken: upsert('emailVerificationTokens'),
  consumeEmailVerificationToken: resync('emailVerificationTokens'),
  createAccountDeletionToken: upsert('accountDeletionTokens'),
  consumeAccountDeletionToken: resync('accountDeletionTokens'),
  createInvitationToken: upsert('invitationTokens'),
  incrementInvitationTokenUseCount: upsert('invitationTokens'),
  revokeInvitationToken: upsert('invitationTokens'),
  createInvitationRedemption: upsert('invitationRedemptions'),
  purgeUserAuthArtifacts: resync(
    'passwordResetTokens',
    'emailVerificationTokens',
    'accountDeletionTokens',
    'refreshTokens',
    'revokedSessions',
    'pendingOAuthLinks',
  ),
  createRefreshToken: upsert('refreshTokens'),
  markRefreshTokenReplaced: upsert('refreshTokens'),
  revokeRefreshTokenFamily: resync('refreshTokens'),
  revokeRefreshTokensForUser: resync('refreshTokens'),
  revokeSession: upsert('revokedSessions'),
  createMessage: upsert('messages'),
  createVote: upsert('votes'),
  castVote: upsert('voteEntries'),
  createFederationLink: upsert('federationLinks'),
  createForumPost: upsert('forumPosts'),
  createDeadDrop: upsert('deadDrops'),
  openDeadDrop: upsert('deadDrops'),
  createDeadmanSwitch: upsert('deadmanSwitches'),
  updateDeadmanSwitch: upsert('deadmanSwitches'),
  createModerationAction: upsert('moderationActions'),
  upsertCreatorStreamAuth: upsert('creatorStreamAuth'),
  upsertStream: upsert('streams'),
  createStreamSession: upsert('streamSessions'),
  endStreamSession: upsert('streamSessions'),
  upsertStreamModeration: upsert('streamModeration'),
  createOrUpdateVoiceRoom: upsert('canopyVoiceRooms'),
  setVoiceRoomLock: upsert('canopyVoiceRooms'),
  joinVoiceRoom: upsert('voiceRoomParticipants'),
  leaveVoiceRoom: upsert('voiceRoomParticipants'),
  logVoiceRoomEvent: upsert('voiceRoomEvents'),
  upsertMarketplaceEntitlement: upsert('marketplaceEntitlements'),
  recordMarketplaceWebhook: upsert('marketplaceWebhookAudit'),
  markMarketplaceWebhookProcessed: upsert('marketplaceWebhookAudit'),
  upsertMarketplaceLicenseKey: upsert('marketplaceLicenseKeys'),
  upsertMarketplaceListingsCache: upsert('marketplaceListingsCache'),
  insertTip: upsert('tips'),
  updateTip: upsert('tips'),
  insertCreatorSubscriptionTier: upsert('creatorSubscriptionTiers'),
  updateCreatorSubscriptionTier: upsert('creatorSubscriptionTiers'),
  insertCreatorSubscription: upsert('creatorSubscriptions'),
  updateCreatorSubscription: upsert('creatorSubscriptions'),
  insertCommunityBoostPledge: upsert('communityBoostPledges'),
  updateCommunityBoostPledge: upsert('communityBoostPledges'),
  insertAidPool: upsert('aidPools'),
  updateAidPool: upsert('aidPools'),
  insertAdRevenuePeriod: upsert('adRevenuePeriods'),
  updateAdRevenuePeriod: upsert('adRevenuePeriods'),
  insertAdRevenueShare: upsert('adRevenueShares'),
  updateAdRevenueShare: upsert('adRevenueShares'),
  upsertLinkedAccount: upsert('linkedAccounts'),
  deleteLinkedAccount: resync('linkedAccounts'),
  setLinkedAccountSyncCursor: upsert('linkedAccounts'),
  createPendingOAuthLink: upsert('pendingOAuthLinks'),
  consumePendingOAuthLink: resync('pendingOAuthLinks'),
  prunePendingOAuthLinks: resync('pendingOAuthLinks'),
  createTwitchChatBridge: upsert('twitchChatBridges'),
  updateTwitchChatBridge: upsert('twitchChatBridges'),
  deleteTwitchChatBridge: resync('twitchChatBridges'),
  createTwitchEventSubscription: upsert('twitchEventSubscriptions'),
  updateTwitchEventSubscriptionStatus: upsert('twitchEventSubscriptions'),
  deleteTwitchEventSubscription: resync('twitchEventSubscriptions'),
  createWidgetAlertToken: upsert('widgetAlertTokens'),
  revokeWidgetAlertToken: upsert('widgetAlertTokens'),
  createYoutubeChatBridge: upsert('youtubeChatBridges'),
  updateYoutubeChatBridge: upsert('youtubeChatBridges'),
  deleteYoutubeChatBridge: resync('youtubeChatBridges'),
  createKickChatBridge: upsert('kickChatBridges'),
  updateKickChatBridge: upsert('kickChatBridges'),
  deleteKickChatBridge: resync('kickChatBridges'),
  createSimulcastDestination: upsert('simulcastDestinations'),
  updateSimulcastDestination: upsert('simulcastDestinations'),
  deleteSimulcastDestination: resync('simulcastDestinations'),
  createDiscordCompatWebhook: upsert('discordCompatWebhooks'),
  updateDiscordCompatWebhook: upsert('discordCompatWebhooks'),
  deleteDiscordCompatWebhook: resync('discordCompatWebhooks'),
  createOutboundEventWebhook: upsert('outboundEventWebhooks'),
  updateOutboundEventWebhook: upsert('outboundEventWebhooks'),
  deleteOutboundEventWebhook: resync('outboundEventWebhooks'),
  createTwitchIrcBotToken: upsert('twitchIrcBotTokens'),
  revokeTwitchIrcBotToken: upsert('twitchIrcBotTokens'),
  deleteTwitchIrcBotToken: resync('twitchIrcBotTokens'),
  createObsWsPassword: upsert('obsWsPasswords'),
  revokeObsWsPassword: upsert('obsWsPasswords'),
  deleteObsWsPassword: resync('obsWsPasswords'),
  createTwitchExtensionPanel: upsert('twitchExtensionPanels'),
  updateTwitchExtensionPanel: upsert('twitchExtensionPanels'),
  deleteTwitchExtensionPanel: resync('twitchExtensionPanels'),
  upsertCoalitionSpatialItem: upsert('coalitionSpatialItems'),
  createCoalitionAidPost: upsert('coalitionAidPosts'),
  upsertCoalitionEvent: upsert('coalitionEvents'),
  upsertEventRsvp: upsert('eventRsvps'),
  upsertVolunteerSlot: upsert('eventVolunteerSlots'),
  upsertVolunteerSignup: upsert('eventVolunteerSignups'),
  upsertRideOffer: upsert('eventRideOffers'),
  upsertRideClaim: upsert('eventRideClaims'),
  upsertCoalitionRing: upsert('coalitionRings'),
  upsertRingMembership: upsert('ringMemberships'),
  upsertRingInvitation: upsert('ringInvitations'),
  recordCoalitionKitApplication: upsert('coalitionKitApplications'),
  createCoalitionTask: upsert('coalitionTasks'),
  updateCoalitionTaskStatus: upsert('coalitionTasks'),
  upsertSellerLocation: upsert('sellerLocations'),
  upsertCoalitionFeedItem: upsert('coalitionFeedItems'),
  upsertCanopyDirectoryEntry: upsert('canopyDirectoryEntries'),
  upsertClip: upsert('clips'),
  updateClip: upsert('clips'),
  deleteClip: resync('clips'),
  upsertColiseumTopic: upsert('coliseumTopics'),
  upsertColiseumArgument: upsert('coliseumArguments'),
  // Bulk insert returns void; resync persists every in-memory argument.
  upsertColiseumArguments: resync('coliseumArguments'),
  upsertColiseumVote: upsert('coliseumVotes'),
  upsertColiseumLiveSession: upsert('coliseumLiveSessions'),
  createPluginInstallation: upsert('pluginInstallations'),
  updatePluginInstallation: upsert('pluginInstallations'),
  deletePluginInstallation: resync('pluginInstallations'),
  addReputationEvent: upsert('reputationEvents'),
  createPluginDen: upsert('pluginDens'),
  createCoalitionKitManifestApplication: upsert('coalitionKitManifestApplications'),
  updateCoalitionKitManifestApplication: upsert('coalitionKitManifestApplications'),
  upsertPluginReview: upsert('pluginReviews'),
  createPluginFork: upsert('pluginForks'),
  createPluginShowcase: upsert('pluginShowcases'),
};
