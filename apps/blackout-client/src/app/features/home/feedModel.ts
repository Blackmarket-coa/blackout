/**
 * Pure helpers that turn a list of joined Matrix `Room` instances into
 * a chronologically-merged HomeFeed. Kept dependency-light (a small
 * `RoomLike` interface instead of importing matrix-js-sdk directly) so
 * unit tests can run without crypto / `window` side-effects, mirroring
 * the lazy-import lesson PR 1 captured in CommunitiesRoute.
 */

export type HomeFeedBucket = 'today' | 'this-week' | 'older';

export interface HomeFeedItem {
    /** Stable id for React keys. Currently the den (room) id. */
    id: string;
    canopyId: string | null;
    denId: string;
    title: string;
    subtitle: string;
    /** Latest activity ms-since-epoch; null when the room has no events. */
    lastActiveAt: number | null;
    unreadCount: number;
    bucket: HomeFeedBucket;
}

export interface RoomLike {
    readonly roomId: string;
    name: string;
    getType?(): string | undefined;
    getMyMembership?(): string;
    getLastActiveTimestamp?(): number;
    getUnreadNotificationCount?(): number;
    /**
     * Best-effort accessor for the parent space id. Matrix's
     * `Room.getCanonicalParent()` returns `null` when no parent is set;
     * we shrink the surface here so the helper works in both real and
     * fake-room test fixtures.
     */
    getCanonicalParent?(): string | null;
    /**
     * Best-effort accessor for a member, shrunk to the slice needed to read
     * `is_direct` off our own `m.room.member` event (the DM marker a direct
     * invite stamps on the recipient — see `utils/room.ts#isDirectInvite`).
     * Structural so this pure model stays free of matrix-js-sdk.
     */
    getMember?(userId: string): {
        events?: { member?: { getContent?: () => Record<string, unknown> | undefined } };
    } | null;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
/** Staleness window shared by feed buckets, den collapsing, and pulse stats. */
export const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

const HOME_FEED_DEFAULT_LIMIT = 50;

const safeNumber = (raw: unknown): number =>
    typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;

/** Mirrors `utils/room.ts#isDirectInvite` on the `RoomLike` surface. */
const isDirectByMemberEvent = (room: RoomLike, myUserId: string | null): boolean => {
    if (!myUserId) return false;
    const content = room.getMember?.(myUserId)?.events?.member?.getContent?.();
    return content?.is_direct === true;
};

const isJoinedDen = (
    room: RoomLike,
    dmRoomIds: ReadonlySet<string>,
    myUserId: string | null
): boolean => {
    if (room.getType?.() === 'm.space') return false;
    // DMs are conversations, not dens — they must never surface as DEN cards.
    // `dmRoomIds` comes from m.direct account data, this app's authoritative DM
    // registry, and is required so callers can't silently skip the filter.
    if (dmRoomIds.has(room.roomId)) return false;
    // Belt-and-braces for DMs that never made it into m.direct: a direct
    // invite stamps `is_direct` on our own member event, so treat those rooms
    // as DMs even without an m.direct entry.
    if (isDirectByMemberEvent(room, myUserId)) return false;
    if (typeof room.getMyMembership === 'function' && room.getMyMembership() !== 'join')
        return false;
    return true;
};

/**
 * Bucket label for sticky section headers in HomeFeed. Returns `older`
 * when no `lastActiveAt` is available so empty rooms are still
 * groupable.
 */
export const resolveBucket = (lastActiveAt: number | null, now: number): HomeFeedBucket => {
    if (lastActiveAt === null) return 'older';
    const delta = now - lastActiveAt;
    if (delta < ONE_DAY_MS) return 'today';
    if (delta < SEVEN_DAYS_MS) return 'this-week';
    return 'older';
};

const truncate = (value: string, max: number): string => {
    if (value.length <= max) return value;
    return value.slice(0, max - 1) + '…';
};

const buildSubtitle = (room: RoomLike, lastActiveAt: number | null, now: number): string => {
    if (lastActiveAt === null) return 'No recent activity yet.';
    const delta = now - lastActiveAt;
    if (delta < 60 * 1000) return 'Active just now';
    if (delta < ONE_DAY_MS) {
        const hours = Math.max(1, Math.floor(delta / (60 * 60 * 1000)));
        return `Active ${hours}h ago`;
    }
    if (delta < SEVEN_DAYS_MS) {
        const days = Math.max(1, Math.floor(delta / ONE_DAY_MS));
        return `Active ${days}d ago`;
    }
    return 'Quiet for a while';
};

/**
 * Pure projection: joined dens → chronologically-sorted feed items.
 *
 * Input contract:
 *   - rooms: list of joined Matrix rooms (canopies/spaces are filtered
 *     out automatically; we only render dens)
 *   - now: ms-since-epoch reference time. Tests pass a fixed value;
 *     production passes `Date.now()`.
 *   - options.dmRoomIds: m.direct room ids — REQUIRED so DM exclusion fails
 *     closed (a forgotten set once leaked private 1:1 DMs as den cards).
 *   - options.myUserId: viewer's mxid for the `is_direct` member-event check;
 *     pass null only when no client is available.
 *   - options.limit: max number of feed items to return; default 50.
 *
 * Sort order:
 *   1. items with `lastActiveAt` desc
 *   2. items with `lastActiveAt === null` last (alphabetical by name)
 */
export const buildHomeFeed = (
    rooms: readonly RoomLike[],
    now: number,
    options: { dmRoomIds: ReadonlySet<string>; myUserId: string | null; limit?: number }
): HomeFeedItem[] => {
    const limit = options.limit ?? HOME_FEED_DEFAULT_LIMIT;
    const dens = rooms.filter((room) => isJoinedDen(room, options.dmRoomIds, options.myUserId));

    const items: HomeFeedItem[] = dens.map((room) => {
        const lastActiveRaw = room.getLastActiveTimestamp?.();
        const lastActiveAt =
            typeof lastActiveRaw === 'number' && Number.isFinite(lastActiveRaw) && lastActiveRaw > 0
                ? lastActiveRaw
                : null;
        const unreadCount = safeNumber(room.getUnreadNotificationCount?.());
        const canopyId = room.getCanonicalParent?.() ?? null;
        return {
            id: room.roomId,
            canopyId,
            denId: room.roomId,
            title: truncate(room.name?.trim() || room.roomId, 80),
            subtitle: buildSubtitle(room, lastActiveAt, now),
            lastActiveAt,
            unreadCount,
            bucket: resolveBucket(lastActiveAt, now),
        };
    });

    items.sort((a, b) => {
        const lhs = a.lastActiveAt ?? -Infinity;
        const rhs = b.lastActiveAt ?? -Infinity;
        if (lhs !== rhs) return rhs - lhs;
        return a.title.localeCompare(b.title);
    });

    return items.slice(0, limit);
};

/**
 * Sectioned variant for sticky-header rendering. Buckets preserve the
 * upstream sort, so within a bucket items remain recency-ordered.
 */
export const groupHomeFeedByBucket = (
    items: readonly HomeFeedItem[]
): Array<{ bucket: HomeFeedBucket; items: HomeFeedItem[] }> => {
    const today: HomeFeedItem[] = [];
    const thisWeek: HomeFeedItem[] = [];
    const older: HomeFeedItem[] = [];
    for (const item of items) {
        if (item.bucket === 'today') today.push(item);
        else if (item.bucket === 'this-week') thisWeek.push(item);
        else older.push(item);
    }
    const groups: Array<{ bucket: HomeFeedBucket; items: HomeFeedItem[] }> = [];
    if (today.length > 0) groups.push({ bucket: 'today', items: today });
    if (thisWeek.length > 0) groups.push({ bucket: 'this-week', items: thisWeek });
    if (older.length > 0) groups.push({ bucket: 'older', items: older });
    return groups;
};
