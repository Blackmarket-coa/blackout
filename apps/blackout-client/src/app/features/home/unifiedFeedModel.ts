/**
 * Pure helpers that normalize heterogeneous feature content (dens,
 * livestreams, coalition feed, coliseum topics, profile statuses) into a
 * single `UnifiedFeedItem` shape so the home page can merge, rank, and
 * partition them client-side. Kept dependency-light (no matrix-js-sdk,
 * no React) so it unit-tests cleanly, mirroring `feedModel.ts`.
 */
import type { CoalitionFeedItem, ColiseumTopic, NormalizedListing } from '@blackout/core';
import {
    buildCommunitiesPath,
    buildLivePath,
    COALITION_PATH,
    COLISEUM_PATH,
    GOVERNANCE_PATH,
    MARKET_PATH,
} from '../../pages/paths';
import { buildHomeFeed, type RoomLike } from './feedModel';
import type { StreamSummary } from '../streams/streamsClient';

export type UnifiedFeedSource =
    | 'den'
    | 'stream'
    | 'coalition'
    | 'coliseum'
    | 'status'
    | 'wall'
    | 'marketplace'
    | 'governance';

interface UnifiedFeedItemBase {
    /** Unique across sources: `${source}:${rawId}`. */
    id: string;
    source: UnifiedFeedSource;
    title: string;
    subtitle: string;
    /** Drives the Following partition + den deep-links. */
    canopyId: string | null;
    denId: string | null;
    /** Normalized ms-since-epoch; null when no timestamp is available. */
    timestamp: number | null;
    /** 0..1 rank key. */
    score: number;
    /** Precomputed destination (built via `pages/paths.ts`). */
    href: string;
    /** Optional pill: "LIVE", unread count, status emoji. */
    badge?: string;
    mediaUrl?: string;
    tags: string[];
}

export interface DenFeedItem extends UnifiedFeedItemBase {
    source: 'den';
    unreadCount: number;
}
export interface StreamFeedItem extends UnifiedFeedItemBase {
    source: 'stream';
    live: boolean;
}
export interface CoalitionFeedCardItem extends UnifiedFeedItemBase {
    source: 'coalition';
    kind: CoalitionFeedItem['kind'];
}
export interface ColiseumFeedCardItem extends UnifiedFeedItemBase {
    source: 'coliseum';
    status: ColiseumTopic['status'];
}
export interface StatusFeedItem extends UnifiedFeedItemBase {
    source: 'status';
    emoji?: string;
}
export interface WallFeedItem extends UnifiedFeedItemBase {
    source: 'wall';
    authorId: string;
}
export interface MarketplaceFeedItem extends UnifiedFeedItemBase {
    source: 'marketplace';
    priceCents: number;
    currency: string;
}

/** Governance proposal status/type, kept as local string unions so this pure
 * model stays free of the matrix/protocol packages. */
export type GovernanceFeedStatus = 'active' | 'passed' | 'failed' | 'cancelled';
export type GovernanceFeedType = 'binary' | 'multiple_choice' | 'ranked' | 'consent';

export interface GovernanceFeedItem extends UnifiedFeedItemBase {
    source: 'governance';
    status: GovernanceFeedStatus;
    proposalType: GovernanceFeedType;
}

export type UnifiedFeedItem =
    | DenFeedItem
    | StreamFeedItem
    | CoalitionFeedCardItem
    | ColiseumFeedCardItem
    | StatusFeedItem
    | WallFeedItem
    | MarketplaceFeedItem
    | GovernanceFeedItem;

/** Lightweight projection of a profile status for the feed. */
export interface StatusEntry {
    userId: string;
    displayName: string;
    text: string;
    emoji?: string;
}

/** Lightweight projection of a wall post for the feed. */
export interface WallEntry {
    id: string;
    /** Profile the post lives on (the wall owner). */
    ownerUserId: string;
    ownerDisplayName: string;
    body: string;
    authorId: string;
    createdAt: string;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;
const UNIFIED_FEED_DEFAULT_LIMIT = 50;
const LIVE_RAIL_DEFAULT_LIMIT = 8;
/**
 * Default per-source ceiling inside a ranked page. Keeps one prolific surface
 * (e.g. a user joined to dozens of dens) from crowding every other source out
 * of the cut; overflow items backfill only when the feed would otherwise run
 * short of `limit`.
 */
export const UNIFIED_FEED_DEFAULT_MAX_PER_SOURCE = 12;

const clamp01 = (value: number): number => {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
};

/** Linear recency over a 7-day window: 1 = now, 0 = ≥7 days old / unknown. */
const recencyScore = (timestamp: number | null, now: number): number => {
    if (timestamp === null) return 0;
    return clamp01(1 - (now - timestamp) / SEVEN_DAYS_MS);
};

const parseTimestamp = (raw: string | undefined): number | null => {
    if (!raw) return null;
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
};

const relativeSubtitle = (timestamp: number | null, now: number): string => {
    if (timestamp === null) return 'Just now';
    const delta = now - timestamp;
    if (delta < 60 * 1000) return 'Just now';
    if (delta < ONE_DAY_MS) return `${Math.max(1, Math.floor(delta / (60 * 60 * 1000)))}h ago`;
    if (delta < SEVEN_DAYS_MS) return `${Math.max(1, Math.floor(delta / ONE_DAY_MS))}d ago`;
    return new Date(timestamp).toLocaleDateString();
};

export const mapStreams = (streams: readonly StreamSummary[], now: number): StreamFeedItem[] =>
    streams.map((stream) => {
        const timestamp = parseTimestamp(stream.updatedAt);
        const live = stream.state === 'live';
        const recency = recencyScore(timestamp, now);
        return {
            id: `stream:${stream.id}`,
            source: 'stream',
            live,
            title: stream.title,
            subtitle: live
                ? `Live now${stream.category ? ` · ${stream.category}` : ''}`
                : `Offline · ${relativeSubtitle(timestamp, now)}`,
            canopyId: null,
            denId: stream.denId ?? null,
            timestamp,
            score: live ? clamp01(0.9 + 0.1 * recency) : clamp01(0.35 * recency),
            href: buildLivePath(stream.id),
            badge: live ? 'LIVE' : undefined,
            tags: stream.tags ?? [],
        };
    });

export const mapCoalition = (
    items: readonly CoalitionFeedItem[],
    now: number
): CoalitionFeedCardItem[] =>
    items.map((item) => {
        const timestamp = parseTimestamp(item.createdAt);
        return {
            id: `coalition:${item.id}`,
            source: 'coalition',
            kind: item.kind,
            title: item.title,
            subtitle: `${item.kind} · ${relativeSubtitle(timestamp, now)}`,
            canopyId: item.canopyId ?? null,
            denId: item.denId ?? null,
            timestamp,
            score: clamp01(item.score),
            href: COALITION_PATH,
            mediaUrl: item.mediaUrl,
            tags: item.tags ?? [],
        };
    });

export const mapColiseum = (
    topics: readonly ColiseumTopic[],
    now: number
): ColiseumFeedCardItem[] =>
    topics.map((topic) => {
        const timestamp = parseTimestamp(topic.createdAt);
        return {
            id: `coliseum:${topic.id}`,
            source: 'coliseum',
            status: topic.status,
            title: topic.title,
            subtitle: topic.newsAnchor?.headline ?? `Debate · ${relativeSubtitle(timestamp, now)}`,
            canopyId: topic.canopyId ?? null,
            denId: topic.denId ?? null,
            timestamp,
            score: clamp01(topic.debateHeat),
            href: COLISEUM_PATH,
            mediaUrl: topic.newsAnchor?.opengraphImage,
            tags: topic.tags ?? [],
        };
    });

/** Lightweight projection of a governance proposal for the feed. The hook
 * extracts these from joined-room state so this model stays matrix-free. */
export interface GovernanceProposalEntry {
    proposalEventId: string;
    /** Canopy/space the proposal lives in, for the Following partition. */
    canopyId: string | null;
    title: string;
    status: GovernanceFeedStatus;
    proposalType: GovernanceFeedType;
    /** Event timestamp (ms-since-epoch) the proposal was created. */
    createdAt: number;
}

const GOVERNANCE_TYPE_LABEL: Record<GovernanceFeedType, string> = {
    binary: 'Yes/no vote',
    multiple_choice: 'Multiple choice',
    ranked: 'Ranked vote',
    consent: 'Consent round',
};

const GOVERNANCE_STATUS_LABEL: Record<GovernanceFeedStatus, string> = {
    active: 'Vote open',
    passed: 'Passed',
    failed: 'Failed',
    cancelled: 'Cancelled',
};

export const mapGovernance = (
    entries: readonly GovernanceProposalEntry[],
    now: number
): GovernanceFeedItem[] =>
    entries.map((entry) => {
        const active = entry.status === 'active';
        const recency = recencyScore(entry.createdAt, now);
        return {
            id: `governance:${entry.proposalEventId}`,
            source: 'governance',
            status: entry.status,
            proposalType: entry.proposalType,
            title: entry.title,
            subtitle: active
                ? `${GOVERNANCE_STATUS_LABEL.active} · ${GOVERNANCE_TYPE_LABEL[entry.proposalType]}`
                : `${GOVERNANCE_STATUS_LABEL[entry.status]} · ${relativeSubtitle(
                      entry.createdAt,
                      now
                  )}`,
            canopyId: entry.canopyId,
            denId: null,
            timestamp: entry.createdAt,
            // Active proposals lead governance; settled ones fade with age.
            score: clamp01(active ? 0.7 + 0.3 * recency : 0.3 * recency),
            href: GOVERNANCE_PATH,
            badge: active ? 'VOTE' : undefined,
            tags: [],
        };
    });

export const mapDens = (
    rooms: readonly RoomLike[],
    now: number,
    dmRoomIds?: ReadonlySet<string>
): DenFeedItem[] =>
    buildHomeFeed(rooms, now, { dmRoomIds }).map((item) => ({
        id: `den:${item.denId}`,
        source: 'den',
        unreadCount: item.unreadCount,
        title: item.title,
        subtitle: item.subtitle,
        canopyId: item.canopyId,
        denId: item.denId,
        timestamp: item.lastActiveAt,
        score: clamp01(
            0.6 * recencyScore(item.lastActiveAt, now) + (item.unreadCount > 0 ? 0.2 : 0)
        ),
        href: buildCommunitiesPath(item.canopyId, item.denId),
        badge:
            item.unreadCount > 0
                ? item.unreadCount > 99
                    ? '99+'
                    : String(item.unreadCount)
                : undefined,
        tags: [],
    }));

export const mapStatuses = (entries: readonly StatusEntry[], now: number): StatusFeedItem[] =>
    entries.map((entry) => ({
        id: `status:${entry.userId}`,
        source: 'status',
        emoji: entry.emoji,
        title: entry.displayName,
        // Statuses carry no `createdAt`, only `expiresAt`, so we treat them as
        // "now" and give them a modest, fixed weight.
        subtitle: `${entry.emoji ? `${entry.emoji} ` : ''}${entry.text}`,
        canopyId: null,
        denId: null,
        timestamp: now,
        score: 0.5,
        href: `/creators/${encodeURIComponent(entry.userId)}`,
        badge: entry.emoji,
        tags: [],
    }));

const truncate = (value: string, max: number): string =>
    value.length <= max ? value : `${value.slice(0, max - 1)}…`;

export const mapWallPosts = (entries: readonly WallEntry[], now: number): WallFeedItem[] =>
    entries.map((entry) => {
        const timestamp = parseTimestamp(entry.createdAt);
        return {
            id: `wall:${entry.id}`,
            source: 'wall',
            authorId: entry.authorId,
            title: entry.ownerDisplayName,
            subtitle: truncate(entry.body, 140),
            canopyId: null,
            denId: null,
            timestamp,
            score: clamp01(0.5 * recencyScore(timestamp, now) + 0.15),
            href: `/creators/${encodeURIComponent(entry.ownerUserId)}`,
            tags: [],
        };
    });

const formatPrice = (priceCents: number, currency: string): string => {
    const amount = (priceCents / 100).toFixed(2);
    return currency.toUpperCase() === 'USD' ? `$${amount}` : `${amount} ${currency.toUpperCase()}`;
};

export const mapMarketplace = (
    listings: readonly NormalizedListing[],
    now: number
): MarketplaceFeedItem[] =>
    listings.map((listing) => ({
        id: `marketplace:${listing.providerId}:${listing.providerListingId}`,
        source: 'marketplace',
        priceCents: listing.priceCents,
        currency: listing.currency,
        title: listing.title,
        subtitle: `${formatPrice(listing.priceCents, listing.currency)} · ${listing.category}`,
        canopyId: null,
        denId: null,
        // Listings carry no timestamp; treat as "now" with a modest fixed weight
        // so they surface in Discover without dominating time-ranked activity.
        timestamp: now,
        score: 0.4,
        href: MARKET_PATH,
        mediaUrl: listing.mediaUrls[0],
        tags: listing.tags ?? [],
    }));

/** Bonus added to an item's score when it matches a viewer-interest tag. */
const INTEREST_BOOST = 0.15;

/**
 * Feed sort modes, mirroring conventions migrants already know:
 *   - hot: trending — base score blended with recency (Reddit "Hot").
 *   - new: strictly newest-first (Reddit "New").
 *   - top: highest base score regardless of age (Reddit "Top").
 * Absent → behaves like `top` (pure score desc), the historical default.
 */
export type FeedSort = 'hot' | 'new' | 'top';

const HOT_SCORE_WEIGHT = 0.7;
const HOT_RECENCY_WEIGHT = 0.3;

/**
 * Effective rank score: the item's base score plus a fixed bonus when any of
 * its tags is in `boostTags`. The base `score` is never mutated, keeping the
 * helper pure.
 */
const effectiveScore = (
    item: UnifiedFeedItem,
    boostTags: ReadonlySet<string> | undefined
): number => {
    if (!boostTags || boostTags.size === 0) return item.score;
    return item.tags.some((tag) => boostTags.has(tag))
        ? clamp01(item.score + INTEREST_BOOST)
        : item.score;
};

/** The value a given sort mode ranks an item by (higher = earlier). */
const rankValue = (
    item: UnifiedFeedItem,
    boostTags: ReadonlySet<string> | undefined,
    sort: FeedSort | undefined,
    now: number
): number => {
    const score = effectiveScore(item, boostTags);
    if (sort === 'hot') {
        return score * HOT_SCORE_WEIGHT + recencyScore(item.timestamp, now) * HOT_RECENCY_WEIGHT;
    }
    // 'top' and the historical default rank by score alone.
    return score;
};

/**
 * Diversity cap: walk the ranked list keeping at most `maxPerSource` items per
 * source until `limit` is reached. Overflow items backfill trailing slots only
 * when the capped walk comes up short of `limit`, so the cap changes the
 * composition of a full page but never shrinks a scarce one.
 */
const capBySource = (
    ranked: readonly UnifiedFeedItem[],
    maxPerSource: number,
    limit: number
): UnifiedFeedItem[] => {
    const perSource = new Map<UnifiedFeedSource, number>();
    const kept: UnifiedFeedItem[] = [];
    const overflow: UnifiedFeedItem[] = [];
    for (const item of ranked) {
        if (kept.length >= limit) break;
        const count = perSource.get(item.source) ?? 0;
        if (count < maxPerSource) {
            perSource.set(item.source, count + 1);
            kept.push(item);
        } else {
            overflow.push(item);
        }
    }
    if (kept.length >= limit) return kept;
    return kept.concat(overflow.slice(0, limit - kept.length));
};

/**
 * Stable merge: dedupe by id (first occurrence wins), sort per `sort` mode,
 * then slice to `limit`. `boostTags` lifts items matching the viewer's
 * interests (drives the onboarding interest picker). With no `sort`, ordering
 * is score desc / timestamp desc — the historical default. `maxPerSource`
 * applies the diversity cap; it only kicks in when there are more candidates
 * than `limit`, since with a short list capping would merely reorder.
 */
export const mergeAndRank = (
    items: readonly UnifiedFeedItem[],
    options: {
        limit?: number;
        boostTags?: ReadonlySet<string>;
        sort?: FeedSort;
        now?: number;
        maxPerSource?: number;
    } = {}
): UnifiedFeedItem[] => {
    const limit = options.limit ?? UNIFIED_FEED_DEFAULT_LIMIT;
    const { boostTags, sort, maxPerSource } = options;
    const now = options.now ?? Date.now();
    const seen = new Set<string>();
    const deduped: UnifiedFeedItem[] = [];
    for (const item of items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        deduped.push(item);
    }
    deduped.sort((a, b) => {
        if (sort === 'new') {
            const timeA = a.timestamp ?? -Infinity;
            const timeB = b.timestamp ?? -Infinity;
            if (timeA !== timeB) return timeB - timeA;
            return effectiveScore(b, boostTags) - effectiveScore(a, boostTags);
        }
        const rankA = rankValue(a, boostTags, sort, now);
        const rankB = rankValue(b, boostTags, sort, now);
        if (rankA !== rankB) return rankB - rankA;
        return (b.timestamp ?? -Infinity) - (a.timestamp ?? -Infinity);
    });
    if (maxPerSource !== undefined && maxPerSource > 0 && deduped.length > limit) {
        return capBySource(deduped, maxPerSource, limit);
    }
    return deduped.slice(0, limit);
};

/** Convention prefix marking a feed item as part of an episodic series. */
export const SERIES_TAG_PREFIX = 'series:';

/** Returns the series name from a `series:<name>` tag, or null if absent. */
export const seriesNameFromTags = (tags: readonly string[]): string | null => {
    for (const tag of tags) {
        if (tag.toLowerCase().startsWith(SERIES_TAG_PREFIX)) {
            const name = tag.slice(SERIES_TAG_PREFIX.length).trim();
            if (name.length > 0) return name;
        }
    }
    return null;
};

/**
 * Tags items carrying a `series:<name>` tag with a "SERIES" badge to surface
 * the episodic/binge loop. Items that already have a badge (LIVE, unread
 * count, status emoji) keep it — those take priority.
 */
export const withSeriesBadges = (items: readonly UnifiedFeedItem[]): UnifiedFeedItem[] =>
    items.map((item) => {
        if (item.badge) return item;
        return seriesNameFromTags(item.tags) ? { ...item, badge: 'SERIES' } : item;
    });

/** Live streams only, highest-ranked first, capped for the pinned rail. */
export const selectLiveRail = (
    items: readonly UnifiedFeedItem[],
    limit: number = LIVE_RAIL_DEFAULT_LIMIT
): StreamFeedItem[] =>
    items
        .filter((item): item is StreamFeedItem => item.source === 'stream' && item.live)
        .slice(0, limit);

/**
 * "Following" = items attributed to a joined canopy, plus all den activity
 * and statuses (which are inherently personal). Everything else is
 * Discover-only because it can't be attributed to the viewer's memberships.
 */
export const partitionFollowing = (
    items: readonly UnifiedFeedItem[],
    joinedCanopyIds: ReadonlySet<string>
): UnifiedFeedItem[] =>
    items.filter((item) => {
        // Den/status/wall items are inherently personal (own + followed authors),
        // so they always belong in Following.
        if (item.source === 'den' || item.source === 'status' || item.source === 'wall')
            return true;
        return item.canopyId !== null && joinedCanopyIds.has(item.canopyId);
    });

/**
 * Identity for "has the viewer opened this item". Statuses reuse one id per
 * author (`status:<userId>`) and stamp `timestamp: now` on every projection,
 * so their key includes the rendered content — a fresh status from the same
 * author resurfaces, an unchanged one stays seen. Every other source already
 * mints a unique id per underlying item.
 */
export const feedSeenKey = (item: UnifiedFeedItem): string =>
    item.source === 'status' ? `${item.id}@${item.subtitle}` : item.id;

/**
 * Following shows only actionable items: dens while they still have unread
 * activity, and everything else until the viewer has opened it (`seenKeys`
 * holds `feedSeenKey`s of opened items).
 */
export const filterToUnseen = (
    items: readonly UnifiedFeedItem[],
    seenKeys: ReadonlySet<string>
): UnifiedFeedItem[] =>
    items.filter((item) =>
        item.source === 'den' ? item.unreadCount > 0 : !seenKeys.has(feedSeenKey(item))
    );

/**
 * Topic-scoped view of the feed: only items carrying `tag`. Exact-match on
 * purpose — it mirrors the interest-boost matching in `effectiveScore`, so the
 * chip a user follows and the filter it drives agree on what "the topic" is.
 * A null/empty tag is a no-op.
 */
export const filterByTag = (
    items: readonly UnifiedFeedItem[],
    tag: string | null | undefined
): UnifiedFeedItem[] => {
    if (!tag) return [...items];
    return items.filter((item) => item.tags.includes(tag));
};
