// Per-table descriptors + per-mutator write-through specs for PostgresBackedDb.
//
// Most tables are regular: table name = snake_case(mapName), keyed by `id`,
// reflection maps fields ↔ columns. The exceptions (composite/non-id keys, the
// renamed webhook-audit table, and the nested coalition-aid location) are
// declared explicitly. The MUTATOR_SPECS table says, for each InMemoryDb
// mutator, what its call writes to Postgres: an upsert of the record it
// returned, or targeted statements that name the rows it changed, by key or
// by a predicate Postgres evaluates. No spec reconciles a whole table against
// this process's mirror: that deleted every row another process had written
// and this one had not heard of (docs/security/store-cross-process-writes-2026-10-31.md).

import {
    camelToSnake,
    type Row,
    type StepContext,
    type TableDescriptor,
    type TargetedStep,
} from './pgWriter';

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
    coalitionCampaignAttribution: {
        keyOf: (r) => `${r.campaignId}::${r.channel}::${r.sharerUserId ?? ''}`,
        conflictColumns: ['campaign_id', 'channel', 'sharer_user_id'],
    },
    coalitionCampaignEngagement: {
        keyOf: (r) => String(r.campaignPostId),
        conflictColumns: ['campaign_post_id'],
    },
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
    marketplaceSellerProfiles: {
        keyOf: (r) => `${r.userId}::${r.providerId}`,
        conflictColumns: ['user_id', 'provider_id'],
    },
    fbmVendorRooms: { keyOf: (r) => String(r.vendorId), conflictColumns: ['vendor_id'] },
    fbmDisputeRooms: { keyOf: (r) => String(r.disputeId), conflictColumns: ['dispute_id'] },
    fbmAclState: {
        keyOf: (r) => `${r.mxid}::${r.roomId}`,
        conflictColumns: ['mxid', 'room_id'],
    },
    revokedSessions: { keyOf: (r) => String(r.jti), conflictColumns: ['jti'] },
    canopySubscriptions: { keyOf: (r) => String(r.userId), conflictColumns: ['user_id'] },
    processedBillingWebhookEvents: {
        keyOf: (r) => String(r.eventId),
        conflictColumns: ['event_id'],
    },
    linkedAccounts: {
        keyOf: (r) => `${r.blackoutUserId}:${r.provider}`,
        conflictColumns: ['blackout_user_id', 'provider'],
    },
    pendingOAuthLinks: {
        tableName: 'pending_oauth_links',
        keyOf: (r) => String(r.stateHash),
        conflictColumns: ['state_hash'],
    },
    pendingOidcLogins: {
        tableName: 'pending_oidc_logins',
        keyOf: (r) => String(r.stateHash),
        conflictColumns: ['state_hash'],
    },
    twitchEventSubscriptions: {
        keyOf: (r) => String(r.helixSubscriptionId),
        conflictColumns: ['helix_subscription_id'],
    },
    widgetAlertTokens: { keyOf: (r) => String(r.secretHash), conflictColumns: ['secret_hash'] },
    canopyDirectoryEntries: { keyOf: (r) => String(r.canopyId), conflictColumns: ['canopy_id'] },
    // Composite key: one greeting row per (room, user) join — no `id` column.
    denGreetings: {
        keyOf: (r) => `${r.roomId}:${r.userId}`,
        conflictColumns: ['room_id', 'user_id'],
    },
    coliseumVotes: {
        keyOf: (r) => `${r.argumentId}::${r.voterId}`,
        conflictColumns: ['argument_id', 'voter_id'],
    },
    coliseumRoundVotes: {
        keyOf: (r) => `${r.matchId}::${r.roundIndex}::${r.voterId}`,
        conflictColumns: ['match_id', 'round_index', 'voter_id'],
    },
    coliseumResponseDropVotes: {
        keyOf: (r) => `${r.dropId}::${r.voterId}`,
        conflictColumns: ['drop_id', 'voter_id'],
    },
    coliseumCrucibleStatements: {
        keyOf: (r) => `${r.matchId}::${r.side}`,
        conflictColumns: ['match_id', 'side'],
    },
    coliseumCrucibleVotes: {
        keyOf: (r) => `${r.matchId}::${r.questionId}::${r.voterId}`,
        conflictColumns: ['match_id', 'question_id', 'voter_id'],
    },
    coliseumExplainerVotes: {
        keyOf: (r) => `${r.explainerId}::${r.voterId}`,
        conflictColumns: ['explainer_id', 'voter_id'],
    },
    eventRsvps: {
        keyOf: (r) => `${r.eventId}::${r.userId}`,
        conflictColumns: ['event_id', 'user_id'],
    },
    eventVolunteerSignups: {
        keyOf: (r) => `${r.slotId}::${r.userId}`,
        conflictColumns: ['slot_id', 'user_id'],
    },
    coalitionFeedLikes: {
        keyOf: (r) => `${r.feedItemId}::${r.userId}`,
        conflictColumns: ['feed_item_id', 'user_id'],
    },
    circleEdges: {
        keyOf: (r) => `${r.followerId}::${r.followeeId}`,
        conflictColumns: ['follower_id', 'followee_id'],
    },
    relayEdges: {
        keyOf: (r) => `${r.relayerUserId}::${r.subjectSource}::${r.subjectId}`,
        conflictColumns: ['relayer_user_id', 'subject_source', 'subject_id'],
    },
    communityAssetReports: {
        keyOf: (r) => `${r.assetId}::${r.reporterId}`,
        conflictColumns: ['asset_id', 'reporter_id'],
    },
    memberProfiles: {
        keyOf: (r) => String(r.userId),
        conflictColumns: ['user_id'],
    },
    profileWallPosts: { keyOf: KEY_ID, conflictColumns: ['id'] },
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
    coalitionMemberships: {
        keyOf: (r) => `${r.coalitionId}::${r.userId}`,
        conflictColumns: ['coalition_id', 'user_id'],
    },
    coalitionJoinRequests: {
        keyOf: (r) => `${r.coalitionId}::${r.userId}`,
        conflictColumns: ['coalition_id', 'user_id'],
    },
    coalitionConnections: {
        keyOf: (r) => `${r.coalitionId}::${r.platform}`,
        conflictColumns: ['coalition_id', 'platform'],
    },
    coalitionMemberConnections: {
        keyOf: (r) => `${r.coalitionId}::${r.userId}::${r.platform}`,
        conflictColumns: ['coalition_id', 'user_id', 'platform'],
    },
    coalitionCampaignSyncOptIns: {
        keyOf: (r) => `${r.campaignId}::${r.userId}::${r.platform}`,
        conflictColumns: ['campaign_id', 'user_id', 'platform'],
    },
    coalitionBoosts: {
        keyOf: (r) => `${r.campaignId}::${r.userId}::${r.day}`,
        conflictColumns: ['campaign_id', 'user_id', 'day'],
    },
    coalitionCampaignPayees: {
        keyOf: (r) => `${r.campaignId}::${r.userId}`,
        conflictColumns: ['campaign_id', 'user_id'],
    },
    // coalition_rings flattens the optional nested location into lat/lng/address.
    coalitionRings: {
        toRow: (r) => {
            const loc = (r.location ?? {}) as {
                latitude?: number;
                longitude?: number;
                address?: string;
            };
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
            const loc = (r.location ?? {}) as {
                latitude?: number;
                longitude?: number;
                address?: string;
            };
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
                stream_id: r.streamId ?? null,
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
            if (row.stream_id != null) rec.streamId = row.stream_id;
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
    // coalition_aid_posts flattens the nested AidPost.location into lat/lng/address
    // columns. Both coordinates are nullable since migration 090: a post mirrored
    // from FreeBlackMarket carries a coarse `locality` and no pin at all.
    coalitionAidPosts: {
        toRow: (r) => {
            const loc = (r.location ?? {}) as {
                latitude?: number;
                longitude?: number;
                address?: string;
            };
            return {
                id: r.id,
                customer_id: r.customerId,
                type: r.type,
                category: r.category,
                title: r.title,
                description: r.description,
                // Null, not undefined: a mirrored post has no coordinates at
                // all, and the columns dropped their NOT NULL in migration 090
                // precisely so it can be stored as it arrived.
                latitude: loc.latitude ?? null,
                longitude: loc.longitude ?? null,
                address: loc.address ?? null,
                locality: r.locality ?? null,
                display_radius_meters: r.displayRadiusMeters,
                urgency: r.urgency,
                status: r.status,
                expires_at: r.expiresAt ?? null,
                fulfiller_id: r.fulfillerId ?? null,
                fulfilled_at: r.fulfilledAt ?? null,
                den_id: r.denId ?? null,
                source: r.source ?? null,
                external_id: r.externalId ?? null,
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
                displayRadiusMeters: row.display_radius_meters,
                urgency: row.urgency,
                status: row.status,
                createdAt: row.created_at,
            };
            // `location` is present only when the row actually has a pin.
            // Rebuilding it unconditionally would hand every consumer a
            // {latitude: null, longitude: null} object that reads as located.
            if (row.latitude != null && row.longitude != null) {
                rec.location = {
                    latitude: row.latitude,
                    longitude: row.longitude,
                    ...(row.address != null ? { address: row.address } : {}),
                };
            }
            if (row.locality != null) rec.locality = row.locality;
            if (row.expires_at != null) rec.expiresAt = row.expires_at;
            if (row.fulfiller_id != null) rec.fulfillerId = row.fulfiller_id;
            if (row.fulfilled_at != null) rec.fulfilledAt = row.fulfilled_at;
            if (row.den_id != null) rec.denId = row.den_id;
            if (row.source != null) rec.source = row.source;
            if (row.external_id != null) rec.externalId = row.external_id;
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
    'releaseIdentities',
    'moderationActions',
    'creatorStreamAuth',
    'streams',
    'streamSessions',
    'streamModeration',
    'canopyVoiceRooms',
    'voiceRoomParticipants',
    'voiceRoomEvents',
    'voiceRoomSanctions',
    'marketplaceEntitlements',
    'marketplaceWebhookAudit',
    'marketplaceLicenseKeys',
    'marketplaceListingsCache',
    'fbmVendorRooms',
    'fbmBuyerOrderRooms',
    'fbmDeaddropDeliveries',
    'fbmDisputeRooms',
    'fbmAclState',
    'tips',
    'referrals',
    'ambassadors',
    'quests',
    'questCompletions',
    'migrationCredits',
    'bountyRewards',
    'bounties',
    'bountyApplications',
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
    'invitationAdmissions',
    'burnerIdentities',
    'refreshTokens',
    'revokedSessions',
    'linkedAccounts',
    'pendingOAuthLinks',
    'pendingOidcLogins',
    'twitchChatBridges',
    'twitchEventSubscriptions',
    'widgetAlertTokens',
    'youtubeChatBridges',
    'kickChatBridges',
    'simulcastDestinations',
    'discordCompatWebhooks',
    'discordServerImports',
    'discordImportMappings',
    'discordBridgeActivations',
    'outboundEventWebhooks',
    'twitchIrcBotTokens',
    'obsWsPasswords',
    'twitchExtensionPanels',
    'creatorListings',
    'vaultItems',
    'channelPointsRewards',
    'channelPointsLedger',
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
    'coalitionNeeds',
    'coalitionProjects',
    'coalitionProjectSupports',
    'coalitionSurges',
    'coalitionNotifications',
    'coalitionResources',
    'creatorContent',
    'contentDistributions',
    'productReviews',
    'productVersions',
    'sellerLocations',
    'marketplaceSellerProfiles',
    'coalitionFeedItems',
    'coalitionFeedLikes',
    'coalitionFeedComments',
    'circleEdges',
    'relayEdges',
    'communityAssets',
    'communityAssetReports',
    'memberProfiles',
    'profileWallPosts',
    'canopyDirectoryEntries',
    'canaryTokens',
    'denGreetings',
    'meshEnvelopes',
    'clips',
    'coliseumTopics',
    'coliseumChallenges',
    'challengeEntries',
    'challengeVotes',
    'coliseumArguments',
    'coliseumVotes',
    'coliseumLiveSessions',
    'coliseumMatches',
    'coliseumRounds',
    'coliseumRoundVotes',
    'coliseumShouts',
    'coliseumResponseDrops',
    'coliseumResponseDropVotes',
    'coliseumBriefs',
    'coliseumCrucibleStatements',
    'coliseumCrucibleVotes',
    'coliseumExplainers',
    'coliseumExplainerVotes',
    'pluginInstallations',
    'reputationEvents',
    'pluginDens',
    'coalitionKitManifestApplications',
    'pluginReviews',
    'pluginForks',
    'pluginShowcases',
    'canopySubscriptions',
    'subscriptionAuditEvents',
    'processedBillingWebhookEvents',
    'subscriptionGifts',
    'coalitions',
    'coalitionMemberships',
    'coalitionJoinRequests',
    'coalitionConnections',
    'coalitionMemberConnections',
    'coalitionCampaigns',
    'coalitionCampaignPosts',
    'coalitionExternalActivity',
    'coalitionCampaignSyncOptIns',
    'coalitionBoosts',
    'coalitionCampaignContributions',
    'coalitionCampaignEngagement',
    'coalitionCampaignAttribution',
    'coalitionCampaignPayees',
    'coalitionSuccessionPetitions',
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

/**
 * - `upsert`: persist the record the method returned, whole (last writer wins).
 * - `targeted`: run fixed statements (pgWriter's TargetedStep) that name the
 *   rows the call changed, by key or by a predicate Postgres evaluates, in one
 *   transaction; the statements are checked against the schema at boot.
 */
export type MutatorSpec =
    | { kind: 'upsert'; map: string }
    | { kind: 'targeted'; steps: TargetedStep[] };

const upsert = (map: string): MutatorSpec => ({ kind: 'upsert', map });
const targeted = (...steps: TargetedStep[]): MutatorSpec => ({ kind: 'targeted', steps });

/**
 * Delete the one row whose key the call's arguments name, in conflict-column
 * order. Only that row: a row this process has not heard of is never touched,
 * as it was by the whole-table resync this replaces.
 */
const deleteKey = (map: string, key: (args: readonly unknown[]) => unknown[]): MutatorSpec =>
    targeted({ op: 'deleteKey', map, key: (ctx) => key(ctx.args) });
const deleteById = (map: string): MutatorSpec => deleteKey(map, ([id]) => [id]);

type Params = (ctx: StepContext) => readonly unknown[] | undefined;
const deleteWhere = (map: string, where: string, params: Params): TargetedStep => ({
    op: 'deleteWhere',
    map,
    where,
    params,
});
const updateWhere = (map: string, set: string, where: string, params: Params): TargetedStep => ({
    op: 'updateWhere',
    map,
    set,
    where,
    params,
});

/** The record the call left for a key it changed in `map`, or undefined when it changed none there. */
const changedTo = (ctx: StepContext, map: string): Record<string, unknown> | undefined =>
    ctx.changed(map).find((c) => c.after)?.after;

/** A prune's `now` argument as ISO; the time the call returned when it was left to default. */
const nowArg = (ctx: StepContext): string => {
    const v = ctx.args[0];
    return v instanceof Date ? v.toISOString() : typeof v === 'string' ? v : ctx.at;
};

/**
 * A single-use row consumed by key, only while Postgres still has it
 * unconsumed: of two processes that consume it, the first one's
 * `consumed_at` stays, and the other's mirror re-reads it. The call's own
 * record supplies the values; a call that changed nothing (the mirror's row
 * was already consumed, or absent) writes nothing.
 */
const consume = (map: string, keyColumn: string, keyField: string, also = ''): MutatorSpec =>
    targeted(
        updateWhere(
            map,
            'consumed_at = $2',
            `${keyColumn} = $1 AND consumed_at IS NULL${also}`,
            (c) => {
                const r = changedTo(c, map);
                return r ? [r[keyField], r.consumedAt] : undefined;
            }
        )
    );

/**
 * Delete the rows Postgres itself finds expired at the call's `now`. A row
 * this process has not heard of is judged on its own `expires_at`, so an
 * unexpired one stays and an expired one goes, wherever it was written.
 */
const pruneWhere = (map: string, where: string): MutatorSpec =>
    targeted(deleteWhere(map, where, (c) => [nowArg(c)]));

/**
 * Revoke every still-live refresh token matching `column = $1`, including any
 * a peer minted that this process has not heard of. The timestamp is the one
 * the mutator stamped on the mirror's records, so both hold the same value.
 */
const revokeRefreshTokensWhere = (column: string): MutatorSpec =>
    targeted(
        updateWhere(
            'refreshTokens',
            'revoked_at = $2, revoked_reason = $3',
            `${column} = $1 AND revoked_at IS NULL`,
            (c) => [c.args[0], changedTo(c, 'refreshTokens')?.revokedAt ?? c.at, c.args[1]]
        )
    );

/**
 * Every descriptor table with an `ON DELETE CASCADE` foreign key to `users`,
 * and its column. Postgres deletes these rows with the account; deleteUser
 * also deletes them explicitly, first and in the same transaction, so their
 * keys come back from RETURNING and every mirror is told they are gone (the
 * cascade itself tells no one). A test checks this list, with
 * USER_CASCADE_LEFT_IN_MIRRORS, against the live foreign-key catalogue.
 */
export const USER_CASCADE_CHILDREN: ReadonlyArray<{ map: string; column: string }> = [
    { map: 'passwordResetTokens', column: 'user_id' },
    { map: 'refreshTokens', column: 'user_id' },
    { map: 'linkedAccounts', column: 'blackout_user_id' },
    { map: 'pendingOAuthLinks', column: 'blackout_user_id' },
    { map: 'twitchChatBridges', column: 'blackout_user_id' },
    { map: 'twitchEventSubscriptions', column: 'blackout_user_id' },
    { map: 'widgetAlertTokens', column: 'blackout_user_id' },
    { map: 'youtubeChatBridges', column: 'blackout_user_id' },
    { map: 'kickChatBridges', column: 'blackout_user_id' },
    { map: 'simulcastDestinations', column: 'blackout_user_id' },
    { map: 'discordCompatWebhooks', column: 'blackout_user_id' },
    { map: 'outboundEventWebhooks', column: 'blackout_user_id' },
    { map: 'twitchIrcBotTokens', column: 'blackout_user_id' },
    { map: 'obsWsPasswords', column: 'blackout_user_id' },
    { map: 'twitchExtensionPanels', column: 'creator_id' },
    { map: 'channelPointsRewards', column: 'creator_id' },
    { map: 'channelPointsLedger', column: 'channel_id' },
    { map: 'channelPointsLedger', column: 'user_id' },
    { map: 'creatorListings', column: 'seller_user_id' },
    { map: 'vaultItems', column: 'owner_user_id' },
];

/**
 * Cascaded by Postgres with the account but deliberately not deleted
 * explicitly, so no mirror is told. The revocations of a deleted account
 * (its logged-out tokens and its logout-everywhere cutoff) stay in every
 * running process's mirror, which keeps refusing those tokens until it
 * restarts; telling the mirrors would make every process accept them at once
 * for the rest of their lifetime. Nothing reads a revocation as proof that
 * the account exists.
 */
export const USER_CASCADE_LEFT_IN_MIRRORS: ReadonlyArray<{ map: string; column: string }> = [
    { map: 'revokedSessions', column: 'user_id' },
];

/** The account's per-user auth rows, deleted by purgeUserAuthArtifacts. */
const USER_AUTH_ARTIFACTS: ReadonlyArray<{ map: string; column: string }> = [
    { map: 'passwordResetTokens', column: 'user_id' },
    { map: 'emailVerificationTokens', column: 'user_id' },
    { map: 'accountDeletionTokens', column: 'user_id' },
    { map: 'refreshTokens', column: 'user_id' },
    { map: 'linkedAccounts', column: 'blackout_user_id' },
    { map: 'pendingOAuthLinks', column: 'blackout_user_id' },
];

/** The records the call left in `map` for the keys it changed (what an upsertEach writes). */
const changedRecords = (ctx: StepContext, map: string): Array<Record<string, unknown>> =>
    ctx.changed(map).flatMap((c) => (c.after ? [c.after] : []));

/** The keys the call removed from `map`, as deleteKeys entries (single-column keys). */
const removedKeys = (ctx: StepContext, map: string) =>
    ctx.changed(map).flatMap((c) => (c.after ? [] : [{ kv: [c.key] }]));

/**
 * A mesh envelope's `seen_by` merges with whatever Postgres already holds, so
 * a concurrent write from another process keeps the nodes it recorded.
 */
const MESH_SEEN_BY_UNION = {
    seen_by:
        'ARRAY(SELECT DISTINCT s FROM unnest(mesh_envelopes.seen_by || EXCLUDED.seen_by) AS s)',
};

/**
 * An enqueue or a gossip merge writes exactly what it changed in the mirror:
 * each new or changed envelope (with `seen_by` merged), and a delete by id of
 * each envelope the call dropped (the oldest past the cap, or one the merge
 * found expired). An envelope this process has not heard of is never touched.
 */
const meshEnvelopeWrites = (): MutatorSpec =>
    targeted(
        {
            op: 'upsertEach',
            map: 'meshEnvelopes',
            records: (c) => changedRecords(c, 'meshEnvelopes'),
            onConflictSet: MESH_SEEN_BY_UNION,
        },
        { op: 'deleteKeys', map: 'meshEnvelopes', keys: (c) => removedKeys(c, 'meshEnvelopes') }
    );

const deleteByUser = (rows: ReadonlyArray<{ map: string; column: string }>): TargetedStep[] =>
    rows.map(({ map, column }) => deleteWhere(map, `${column} = $1`, (c) => [c.args[0]]));

/**
 * Maps each InMemoryDb mutator to its write-through. `upsert` persists the
 * method's returned record; `targeted` writes only the rows the call changed.
 * A method that writes a map and is absent here is never written to Postgres:
 * store-spec-coverage's U1 lists those (the `reset*ForTest` seams, in-memory
 * diagnostics, and the known gaps) and fails on any other.
 */
export const MUTATOR_SPECS: Record<string, MutatorSpec> = {
    createUser: upsert('users'),
    updateUserPassword: upsert('users'),
    markUserEmailVerified: upsert('users'),
    // The account's cascaded child rows first (see USER_CASCADE_CHILDREN),
    // then the account: only that id, never a row this process has not heard of.
    deleteUser: targeted(...deleteByUser(USER_CASCADE_CHILDREN), {
        op: 'deleteKey',
        map: 'users',
        key: (c) => [c.args[0]],
    }),
    createScheduledMessage: upsert('scheduledMessages'),
    markScheduledMessageDelivered: upsert('scheduledMessages'),
    markScheduledMessageFailed: upsert('scheduledMessages'),
    cancelScheduledMessage: upsert('scheduledMessages'),
    // Account deletion blanks the row and keeps it: see the store method.
    eraseScheduledMessage: upsert('scheduledMessages'),
    createPasswordResetToken: upsert('passwordResetTokens'),
    consumePasswordResetToken: consume('passwordResetTokens', 'id', 'id'),
    deleteExpiredPasswordResetTokens: pruneWhere('passwordResetTokens', 'expires_at < $1'),
    createEmailVerificationToken: upsert('emailVerificationTokens'),
    consumeEmailVerificationToken: consume('emailVerificationTokens', 'id', 'id'),
    markEmailVerificationTokenSent: targeted(
        updateWhere(
            'emailVerificationTokens',
            'sent_at = $2',
            'id = $1 AND sent_at IS NULL',
            (c) => {
                const r = changedTo(c, 'emailVerificationTokens');
                return r ? [r.id, r.sentAt] : undefined;
            }
        )
    ),
    // Supersedes every outstanding token of the account, including one a peer
    // issued that this process has not heard of.
    revokeEmailVerificationTokensForUser: targeted(
        updateWhere(
            'emailVerificationTokens',
            'revoked_reason = $2',
            'user_id = $1 AND consumed_at IS NULL AND revoked_reason IS NULL',
            (c) => [c.args[0], c.args[1]]
        )
    ),
    deleteExpiredEmailVerificationTokens: pruneWhere(
        'emailVerificationTokens',
        'expires_at < $1 AND consumed_at IS NULL'
    ),
    createAccountDeletionToken: upsert('accountDeletionTokens'),
    consumeAccountDeletionToken: consume('accountDeletionTokens', 'id', 'id'),
    createInvitationToken: upsert('invitationTokens'),
    incrementInvitationTokenUseCount: upsert('invitationTokens'),
    revokeInvitationToken: upsert('invitationTokens'),
    createInvitationRedemption: upsert('invitationRedemptions'),
    createInvitationAdmission: upsert('invitationAdmissions'),
    claimInvitationAdmission: upsert('invitationAdmissions'),
    // Account deletion: the admission the account claimed and any for its
    // Matrix id, wherever they were written.
    deleteInvitationAdmissionsForUser: targeted(
        deleteWhere(
            'invitationAdmissions',
            'claimed_by_user_id = $1 OR ($2::text IS NOT NULL AND matrix_user_id = $2::text)',
            (c) => [c.args[0], c.args[1] ?? null]
        )
    ),
    createBurnerIdentity: upsert('burnerIdentities'),
    markBurnerIdentityBurned: upsert('burnerIdentities'),
    rotateBurnerIdentity: upsert('burnerIdentities'),
    // The six maps the method writes. Revocations are not among them.
    purgeUserAuthArtifacts: targeted(...deleteByUser(USER_AUTH_ARTIFACTS)),
    createRefreshToken: upsert('refreshTokens'),
    consumeRefreshTokenForRotation: upsert('refreshTokens'),
    revokeRefreshTokenFamily: revokeRefreshTokensWhere('family_id'),
    revokeRefreshTokensForUser: revokeRefreshTokensWhere('user_id'),
    revokeSession: upsert('revokedSessions'),
    pruneExpiredRevokedSessions: pruneWhere('revokedSessions', 'expires_at <= $1'),
    createMessage: upsert('messages'),
    createVote: upsert('votes'),
    castVote: upsert('voteEntries'),
    createFederationLink: upsert('federationLinks'),
    createForumPost: upsert('forumPosts'),
    createDeadDrop: upsert('deadDrops'),
    openDeadDrop: upsert('deadDrops'),
    createDeadmanSwitch: upsert('deadmanSwitches'),
    updateDeadmanSwitch: upsert('deadmanSwitches'),
    // Account deletion blanks the row and keeps it: see the store method.
    eraseDeadmanSwitch: upsert('deadmanSwitches'),
    // Publishing supersedes the current identity (its own upsert, issued
    // first by publishReleaseIdentity) and then adds the new one.
    supersedeReleaseIdentity: upsert('releaseIdentities'),
    publishReleaseIdentity: upsert('releaseIdentities'),
    // Account deletion blanks the row and keeps it: see the store method.
    eraseReleaseIdentity: upsert('releaseIdentities'),
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
    applyVoiceRoomSanction: upsert('voiceRoomSanctions'),
    liftVoiceRoomSanction: upsert('voiceRoomSanctions'),
    upsertMarketplaceEntitlement: upsert('marketplaceEntitlements'),
    recordMarketplaceWebhook: upsert('marketplaceWebhookAudit'),
    markMarketplaceWebhookProcessed: upsert('marketplaceWebhookAudit'),
    upsertMarketplaceLicenseKey: upsert('marketplaceLicenseKeys'),
    upsertMarketplaceListingsCache: upsert('marketplaceListingsCache'),
    upsertFbmVendorRooms: upsert('fbmVendorRooms'),
    upsertFbmBuyerOrderRoom: upsert('fbmBuyerOrderRooms'),
    upsertFbmDeaddropDelivery: upsert('fbmDeaddropDeliveries'),
    upsertFbmDisputeRoom: upsert('fbmDisputeRooms'),
    upsertFbmAclState: upsert('fbmAclState'),
    insertTip: upsert('tips'),
    updateTip: upsert('tips'),
    insertReferral: upsert('referrals'),
    updateReferral: upsert('referrals'),
    insertAmbassador: upsert('ambassadors'),
    updateAmbassador: upsert('ambassadors'),
    insertQuest: upsert('quests'),
    updateQuest: upsert('quests'),
    insertQuestCompletion: upsert('questCompletions'),
    updateQuestCompletion: upsert('questCompletions'),
    insertMigrationCredit: upsert('migrationCredits'),
    updateMigrationCredit: upsert('migrationCredits'),
    insertBountyReward: upsert('bountyRewards'),
    updateBountyReward: upsert('bountyRewards'),
    createBounty: upsert('bounties'),
    updateBountyStatus: upsert('bounties'),
    claimBounty: upsert('bounties'),
    createBountyApplication: upsert('bountyApplications'),
    // Accepting one applicant claims the bounty and declines every other pending
    // application, in one transaction. The first two statements are gates: if
    // Postgres no longer has the bounty open or the application pending (another
    // process got there first), the op rolls back and this mirror re-reads.
    // The decline reaches siblings this process has not heard of.
    acceptBountyApplication: targeted(
        {
            ...updateWhere(
                'bounties',
                "status = 'claimed', claimed_by = $2, updated_at = $3",
                "id = $1 AND status = 'open'",
                (c) => {
                    const r = c.result as { bounty: Record<string, unknown> } | undefined;
                    return r ? [r.bounty.id, r.bounty.claimedBy, r.bounty.updatedAt] : undefined;
                }
            ),
            required: true,
        },
        {
            ...updateWhere(
                'bountyApplications',
                "status = 'accepted', updated_at = $2",
                "id = $1 AND status = 'pending'",
                (c) => {
                    const r = c.result as { application: Record<string, unknown> } | undefined;
                    return r ? [r.application.id, r.application.updatedAt] : undefined;
                }
            ),
            required: true,
        },
        updateWhere(
            'bountyApplications',
            "status = 'declined', updated_at = $3",
            "bounty_id = $1 AND id <> $2 AND status = 'pending'",
            (c) => {
                const r = c.result as { application: Record<string, unknown> } | undefined;
                return r
                    ? [r.application.bountyId, r.application.id, r.application.updatedAt]
                    : undefined;
            }
        )
    ),
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
    deleteLinkedAccount: deleteKey('linkedAccounts', ([userId, provider]) => [userId, provider]),
    setLinkedAccountSyncCursor: upsert('linkedAccounts'),
    createPendingOAuthLink: upsert('pendingOAuthLinks'),
    // The same expiry test as the store method's.
    consumePendingOAuthLink: consume(
        'pendingOAuthLinks',
        'state_hash',
        'stateHash',
        ' AND expires_at > $2'
    ),
    prunePendingOAuthLinks: pruneWhere('pendingOAuthLinks', 'expires_at <= $1'),
    createPendingOidcLogin: upsert('pendingOidcLogins'),
    consumePendingOidcLogin: consume(
        'pendingOidcLogins',
        'state_hash',
        'stateHash',
        ' AND expires_at > $2'
    ),
    prunePendingOidcLogins: pruneWhere('pendingOidcLogins', 'expires_at <= $1'),
    createTwitchChatBridge: upsert('twitchChatBridges'),
    updateTwitchChatBridge: upsert('twitchChatBridges'),
    deleteTwitchChatBridge: deleteById('twitchChatBridges'),
    createTwitchEventSubscription: upsert('twitchEventSubscriptions'),
    updateTwitchEventSubscriptionStatus: upsert('twitchEventSubscriptions'),
    // Keyed by the Helix subscription id, not a row id.
    deleteTwitchEventSubscription: deleteKey('twitchEventSubscriptions', ([helixId]) => [helixId]),
    createWidgetAlertToken: upsert('widgetAlertTokens'),
    revokeWidgetAlertToken: upsert('widgetAlertTokens'),
    createYoutubeChatBridge: upsert('youtubeChatBridges'),
    updateYoutubeChatBridge: upsert('youtubeChatBridges'),
    deleteYoutubeChatBridge: deleteById('youtubeChatBridges'),
    createKickChatBridge: upsert('kickChatBridges'),
    updateKickChatBridge: upsert('kickChatBridges'),
    deleteKickChatBridge: deleteById('kickChatBridges'),
    createSimulcastDestination: upsert('simulcastDestinations'),
    updateSimulcastDestination: upsert('simulcastDestinations'),
    deleteSimulcastDestination: deleteById('simulcastDestinations'),
    createDiscordCompatWebhook: upsert('discordCompatWebhooks'),
    updateDiscordCompatWebhook: upsert('discordCompatWebhooks'),
    deleteDiscordCompatWebhook: deleteById('discordCompatWebhooks'),
    createDiscordServerImport: upsert('discordServerImports'),
    updateDiscordServerImport: upsert('discordServerImports'),
    createDiscordImportMapping: upsert('discordImportMappings'),
    createDiscordBridgeActivation: upsert('discordBridgeActivations'),
    updateDiscordBridgeActivation: upsert('discordBridgeActivations'),
    deleteDiscordBridgeActivation: deleteById('discordBridgeActivations'),
    createOutboundEventWebhook: upsert('outboundEventWebhooks'),
    updateOutboundEventWebhook: upsert('outboundEventWebhooks'),
    deleteOutboundEventWebhook: deleteById('outboundEventWebhooks'),
    createTwitchIrcBotToken: upsert('twitchIrcBotTokens'),
    revokeTwitchIrcBotToken: upsert('twitchIrcBotTokens'),
    deleteTwitchIrcBotToken: deleteById('twitchIrcBotTokens'),
    createObsWsPassword: upsert('obsWsPasswords'),
    revokeObsWsPassword: upsert('obsWsPasswords'),
    deleteObsWsPassword: deleteById('obsWsPasswords'),
    createTwitchExtensionPanel: upsert('twitchExtensionPanels'),
    updateTwitchExtensionPanel: upsert('twitchExtensionPanels'),
    deleteTwitchExtensionPanel: deleteById('twitchExtensionPanels'),
    createCreatorListing: upsert('creatorListings'),
    updateCreatorListing: upsert('creatorListings'),
    deleteCreatorListing: deleteById('creatorListings'),
    createVaultItem: upsert('vaultItems'),
    updateVaultItem: upsert('vaultItems'),
    deleteVaultItem: deleteById('vaultItems'),
    createChannelPointsReward: upsert('channelPointsRewards'),
    updateChannelPointsReward: upsert('channelPointsRewards'),
    deleteChannelPointsReward: deleteById('channelPointsRewards'),
    appendChannelPointsLedger: upsert('channelPointsLedger'),
    upsertCoalitionSpatialItem: upsert('coalitionSpatialItems'),
    // The sweeper deletes the pin it judged expired, and only while Postgres
    // still holds that version: a pin another process has since rewritten (a
    // restarted sale) is kept, re-read here, and judged again at the next sweep.
    deleteCoalitionSpatialItem: targeted({
        op: 'deleteKey',
        map: 'coalitionSpatialItems',
        key: (c) => [c.args[0]],
        guard: {
            column: 'updated_at',
            nullMatchesAny: true,
            value: (c) => c.before('coalitionSpatialItems', String(c.args[0]))?.updatedAt ?? null,
        },
    }),
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
    upsertCoalition: upsert('coalitions'),
    upsertCoalitionMembership: upsert('coalitionMemberships'),
    upsertCoalitionJoinRequest: upsert('coalitionJoinRequests'),
    upsertCoalitionConnection: upsert('coalitionConnections'),
    upsertCoalitionMemberConnection: upsert('coalitionMemberConnections'),
    upsertCoalitionCampaign: upsert('coalitionCampaigns'),
    upsertCoalitionCampaignPost: upsert('coalitionCampaignPosts'),
    upsertCoalitionExternalActivity: upsert('coalitionExternalActivity'),
    deleteCoalitionExternalActivity: deleteById('coalitionExternalActivity'),
    // The retention sweep deletes the replies it judged past due, each only while
    // Postgres still holds the version it judged. A reply another process has
    // since changed (a steward's decision restarts its window) is kept and
    // re-read; the next daily sweep judges it again.
    deleteCoalitionExternalActivities: targeted({
        op: 'deleteKeys',
        map: 'coalitionExternalActivity',
        keys: (c) =>
            c
                .changed('coalitionExternalActivity')
                .flatMap((ch) =>
                    ch.after ? [] : [{ kv: [ch.key], guard: ch.before?.updatedAt ?? null }]
                ),
        guard: { column: 'updated_at', nullMatchesAny: true },
    }),
    upsertCoalitionCampaignSyncOptIn: upsert('coalitionCampaignSyncOptIns'),
    upsertCoalitionBoost: upsert('coalitionBoosts'),
    upsertCoalitionCampaignContribution: upsert('coalitionCampaignContributions'),
    upsertCoalitionCampaignPayee: upsert('coalitionCampaignPayees'),
    upsertCoalitionSuccessionPetition: upsert('coalitionSuccessionPetitions'),
    recordCoalitionKitApplication: upsert('coalitionKitApplications'),
    createCoalitionTask: upsert('coalitionTasks'),
    updateCoalitionTaskStatus: upsert('coalitionTasks'),
    createCoalitionNeed: upsert('coalitionNeeds'),
    updateCoalitionNeed: upsert('coalitionNeeds'),
    createCoalitionProject: upsert('coalitionProjects'),
    updateCoalitionProjectStatus: upsert('coalitionProjects'),
    updateCoalitionProject: upsert('coalitionProjects'),
    applyCoalitionProjectSupport: upsert('coalitionProjects'),
    addCoalitionProjectSupport: upsert('coalitionProjectSupports'),
    upsertCoalitionSurge: upsert('coalitionSurges'),
    addCoalitionNotification: upsert('coalitionNotifications'),
    markCoalitionNotificationRead: upsert('coalitionNotifications'),
    createCoalitionResource: upsert('coalitionResources'),
    updateCoalitionResource: upsert('coalitionResources'),
    createCreatorContent: upsert('creatorContent'),
    updateCreatorContent: upsert('creatorContent'),
    addContentDistribution: upsert('contentDistributions'),
    upsertProductReview: upsert('productReviews'),
    addProductVersion: upsert('productVersions'),
    upsertSellerLocation: upsert('sellerLocations'),
    upsertCoalitionFeedItem: upsert('coalitionFeedItems'),
    upsertCoalitionFeedLike: upsert('coalitionFeedLikes'),
    createCoalitionFeedComment: upsert('coalitionFeedComments'),
    addCircleEdge: upsert('circleEdges'),
    // A withdrawn follow is deleted outright (unlike a relay, which keeps its
    // row and flips `active`): that one (follower, followee) row.
    removeCircleEdge: deleteKey('circleEdges', ([followerId, followeeId]) => [
        followerId,
        followeeId,
    ]),
    upsertRelayEdge: upsert('relayEdges'),
    upsertCommunityAsset: upsert('communityAssets'),
    upsertCommunityAssetReport: upsert('communityAssetReports'),
    upsertMemberProfile: upsert('memberProfiles'),
    createProfileWallPost: upsert('profileWallPosts'),
    upsertCanopyDirectoryEntry: upsert('canopyDirectoryEntries'),
    upsertCanaryToken: upsert('canaryTokens'),
    markGreeted: upsert('denGreetings'),
    upsertCanopySubscription: upsert('canopySubscriptions'),
    addSubscriptionAuditEvent: upsert('subscriptionAuditEvents'),
    markBillingWebhookEventProcessed: upsert('processedBillingWebhookEvents'),
    upsertSubscriptionGift: upsert('subscriptionGifts'),
    enqueueMeshEnvelope: meshEnvelopeWrites(),
    // Replaces the mirror's whole map: the wrapper diffs the old map against the new.
    replaceMeshEnvelopes: meshEnvelopeWrites(),
    upsertClip: upsert('clips'),
    updateClip: upsert('clips'),
    deleteClip: deleteById('clips'),
    upsertColiseumTopic: upsert('coliseumTopics'),
    upsertSellerProfile: upsert('marketplaceSellerProfiles'),
    createColiseumChallenge: upsert('coliseumChallenges'),
    updateColiseumChallengeStatus: upsert('coliseumChallenges'),
    createChallengeEntry: upsert('challengeEntries'),
    upsertChallengeEntry: upsert('challengeEntries'),
    addChallengeVote: upsert('challengeVotes'),
    upsertColiseumArgument: upsert('coliseumArguments'),
    // A score recompute writes each argument it changed, whole; no deletes.
    upsertColiseumArguments: targeted({
        op: 'upsertEach',
        map: 'coliseumArguments',
        records: (c) => changedRecords(c, 'coliseumArguments'),
    }),
    upsertColiseumVote: upsert('coliseumVotes'),
    upsertColiseumLiveSession: upsert('coliseumLiveSessions'),
    upsertColiseumMatch: upsert('coliseumMatches'),
    upsertColiseumRound: upsert('coliseumRounds'),
    upsertColiseumRoundVote: upsert('coliseumRoundVotes'),
    upsertColiseumShout: upsert('coliseumShouts'),
    upsertColiseumResponseDrop: upsert('coliseumResponseDrops'),
    upsertColiseumResponseDropVote: upsert('coliseumResponseDropVotes'),
    upsertColiseumBrief: upsert('coliseumBriefs'),
    upsertColiseumCrucibleStatement: upsert('coliseumCrucibleStatements'),
    upsertColiseumCrucibleVote: upsert('coliseumCrucibleVotes'),
    upsertColiseumExplainer: upsert('coliseumExplainers'),
    upsertColiseumExplainerVote: upsert('coliseumExplainerVotes'),
    createPluginInstallation: upsert('pluginInstallations'),
    updatePluginInstallation: upsert('pluginInstallations'),
    deletePluginInstallation: deleteById('pluginInstallations'),
    addReputationEvent: upsert('reputationEvents'),
    createPluginDen: upsert('pluginDens'),
    createCoalitionKitManifestApplication: upsert('coalitionKitManifestApplications'),
    updateCoalitionKitManifestApplication: upsert('coalitionKitManifestApplications'),
    upsertPluginReview: upsert('pluginReviews'),
    createPluginFork: upsert('pluginForks'),
    createPluginShowcase: upsert('pluginShowcases'),
};
