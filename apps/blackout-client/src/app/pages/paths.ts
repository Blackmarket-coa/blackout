export const ROOT_PATH = '/';

export type LoginPathSearchParams = {
    username?: string;
    email?: string;
    loginToken?: string;
};
export const LOGIN_PATH = '/login/:server?/';

export type RegisterPathSearchParams = {
    username?: string;
    email?: string;
    token?: string;
};
export const REGISTER_PATH = '/register/:server?/';

export type ResetPasswordPathSearchParams = {
    email?: string;
};
export const RESET_PASSWORD_PATH = '/reset-password/:server?/';

export const _CREATE_PATH = 'create/';
export const _JOIN_PATH = 'join/';
export const _LOBBY_PATH = 'lobby/';
/**
 * array of rooms and senders mxId assigned
 * to search param as string should be "," separated
 * Like: url?rooms=!one:server,!two:server
 */
export type _SearchPathSearchParams = {
    global?: string;
    term?: string;
    order?: string;
    rooms?: string;
    senders?: string;
};
export const _SEARCH_PATH = 'search/';

export type _RoomSearchParams = {
    /* comma separated string of servers */
    viaServers?: string;
};
export const _ROOM_PATH = ':roomIdOrAlias/:eventId?/';

export const HOME_PATH = '/home/';
export const HOME_CREATE_PATH = `/home/${_CREATE_PATH}`;
export const HOME_JOIN_PATH = `/home/${_JOIN_PATH}`;
export const HOME_SEARCH_PATH = `/home/${_SEARCH_PATH}`;
export const HOME_ROOM_PATH = `/home/${_ROOM_PATH}`;

export const LEGACY_DIRECT_PATH = '/direct/';
export type DirectCreateSearchParams = {
    userId?: string;
};
export const MESSAGING_PATH = '/messages/';
export const _LOCKED_IN_PATH = 'locked-in/';
export const DIRECT_CREATE_PATH = `/messages/${_LOCKED_IN_PATH}${_CREATE_PATH}`;
export const DIRECT_ROOM_PATH = `/messages/${_LOCKED_IN_PATH}${_ROOM_PATH}`;
export const DIRECT_PATH = `/messages/${_LOCKED_IN_PATH}`;

export const SPACE_PATH = '/:spaceIdOrAlias/';
export const SPACE_LOBBY_PATH = `/:spaceIdOrAlias/${_LOBBY_PATH}`;
export const SPACE_SEARCH_PATH = `/:spaceIdOrAlias/${_SEARCH_PATH}`;
export const SPACE_ROOM_PATH = `/:spaceIdOrAlias/${_ROOM_PATH}`;

/**
 * Canonical canopy/den routing for the AppShell. A canopy is a Matrix space;
 * a den is a Matrix room. The "-" sentinel is used in `:canopyId` when a den
 * has no parent canopy (legacy direct rooms / home-roomed entities).
 */
export const COMMUNITIES_PATH = '/communities';
export const COMMUNITIES_CANOPY_PATH = '/communities/:canopyId';
export const COMMUNITIES_DEN_PATH = '/communities/:canopyId/dens/:denId';
export const COMMUNITIES_NO_CANOPY_SENTINEL = '-';

/**
 * Top-level destinations introduced by the AppShell (bottom-tab + desktop
 * rail). Surface bodies still live in their feature manifests; these
 * constants are the canonical link targets.
 */
export const TOPICS_PATH = '/topics';
export const TOPIC_DETAIL_PATH = '/topics/:tag';
export const MARKET_PATH = '/market';
export const MARKET_LISTING_PATH = '/market/listings/:listingId';
export const LIVE_PATH = '/live';
export const LIVE_STREAM_PATH = '/live/:streamId';
export const CREATOR_DASHBOARD_PATH = '/creator';
export const CREATOR_LISTINGS_PATH = '/creator/listings';
export const CREATOR_STOREFRONT_PATH = '/creators/:userId';
export const EVENTS_PATH = '/events';
/**
 * Event detail addresses both the host room (canopy or den) and the
 * Matrix state event id, since `co.bmc.event` events live inside a
 * room's state. The "-" sentinel from the canopy/den path applies
 * here too — useful if a future surface emits events into a direct
 * room without a parent canopy.
 */
export const EVENT_DETAIL_PATH = '/events/:roomId/:eventId';

export const buildEventDetailPath = (roomId: string, eventId: string): string =>
    `/events/${encodeURIComponent(roomId)}/${encodeURIComponent(eventId)}`;

/**
 * Helper for building the canonical communities URL from canopy/den ids.
 * Encodes the ids and substitutes the sentinel when the canopy is unknown
 * so the legacy "no parent space" room case round-trips through the new
 * route shape.
 */
export const buildCommunitiesPath = (
    canopyId: string | null | undefined,
    denId: string | null | undefined
): string => {
    if (!canopyId && !denId) return COMMUNITIES_PATH;
    const canopySegment = canopyId ? encodeURIComponent(canopyId) : COMMUNITIES_NO_CANOPY_SENTINEL;
    if (!denId) return `/communities/${canopySegment}`;
    return `/communities/${canopySegment}/dens/${encodeURIComponent(denId)}`;
};

export const _FEATURED_PATH = 'featured/';
export const _SERVER_PATH = ':server/';
export const EXPLORE_PATH = '/explore/';
export const EXPLORE_FEATURED_PATH = `/explore/${_FEATURED_PATH}`;

export type ExploreServerPathSearchParams = {
    limit?: string;
    since?: string;
    term?: string;
    type?: string;
    instance?: string;
};
export const EXPLORE_SERVER_PATH = `/explore/${_SERVER_PATH}`;

export const CREATE_PATH = '/create';

export const _NOTIFICATIONS_PATH = 'notifications/';
export const _INVITES_PATH = 'invites/';
export const LEGACY_INBOX_PATH = '/inbox/';
export type InboxNotificationsPathSearchParams = {
    only?: string;
};
export const INBOX_PATH = MESSAGING_PATH;
export const INBOX_NOTIFICATIONS_PATH = `/messages/${_NOTIFICATIONS_PATH}`;
export const INBOX_INVITES_PATH = `/messages/${_INVITES_PATH}`;

export const SPACE_SETTINGS_PATH = '/space-settings/';

export const ROOM_SETTINGS_PATH = '/room-settings/';

export const ONBOARDING_PATH = '/onboarding/:spaceIdOrAlias/';
export const ONBOARDING_ANALYTICS_PATH = '/onboarding/:spaceIdOrAlias/analytics/';
/**
 * PR 7 — Creator-onboarding fork. Lives outside the space-driven
 * `/onboarding/:spaceIdOrAlias/` machine because the creator path
 * isn't anchored to a single canopy; the wizard owns its own state.
 */
export const ONBOARDING_CREATOR_PATH = '/onboarding/creator';

export const _MONETIZATION_SUBSCRIPTIONS_PLANS_PATH = 'subscriptions/plans/';
export const _MONETIZATION_BOOSTS_PATH = 'boosts/';
export const _MONETIZATION_QUESTS_PATH = 'quests/';
export const _MONETIZATION_MARKETPLACE_PATH = 'marketplace/';
export const _MONETIZATION_APP_MARKETPLACE_PATH = 'app-marketplace/';
export const _MONETIZATION_PAYOUTS_REVENUE_ANALYTICS_PATH = 'payouts/revenue-analytics/';
export const _MONETIZATION_THEME_PACKS_PATH = 'theme-packs/';
export const _MONETIZATION_AID_POOLS_PATH = 'aid-pools/';
export const _MONETIZATION_EARNINGS_PATH = 'earnings/';

export const MONETIZATION_PATH = '/monetization/';
export const MONETIZATION_SUBSCRIPTIONS_PLANS_PATH = `/monetization/${_MONETIZATION_SUBSCRIPTIONS_PLANS_PATH}`;
export const MONETIZATION_BOOSTS_PATH = `/monetization/${_MONETIZATION_BOOSTS_PATH}`;
export const MONETIZATION_QUESTS_PATH = `/monetization/${_MONETIZATION_QUESTS_PATH}`;
export const MONETIZATION_MARKETPLACE_PATH = `/monetization/${_MONETIZATION_MARKETPLACE_PATH}`;
export const MONETIZATION_APP_MARKETPLACE_PATH = `/monetization/${_MONETIZATION_APP_MARKETPLACE_PATH}`;
export const MONETIZATION_PAYOUTS_REVENUE_ANALYTICS_PATH = `/monetization/${_MONETIZATION_PAYOUTS_REVENUE_ANALYTICS_PATH}`;
export const MONETIZATION_THEME_PACKS_PATH = `/monetization/${_MONETIZATION_THEME_PACKS_PATH}`;
export const MONETIZATION_AID_POOLS_PATH = `/monetization/${_MONETIZATION_AID_POOLS_PATH}`;
export const MONETIZATION_EARNINGS_PATH = `/monetization/${_MONETIZATION_EARNINGS_PATH}`;
