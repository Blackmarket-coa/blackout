import { describe, expect, it } from 'vitest';
import type { CoalitionFeedItem, ColiseumTopic, NormalizedListing } from '@blackout/core';
import type { StreamSummary } from '../streams/streamsClient';
import type { RoomLike } from './feedModel';
import {
    mapCoalition,
    mapColiseum,
    mapDens,
    mapMarketplace,
    mapStatuses,
    mapStreams,
    mapWallPosts,
    mergeAndRank,
    partitionFollowing,
    selectLiveRail,
    type UnifiedFeedItem,
} from './unifiedFeedModel';

const NOW = Date.parse('2026-05-24T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

const stream = (overrides: Partial<StreamSummary> & { id: string }): StreamSummary => ({
    creatorId: '@c:s',
    state: 'offline',
    title: overrides.id,
    tags: [],
    visibility: 'public',
    latencyProfile: 'normal',
    updatedAt: new Date(NOW - HOUR).toISOString(),
    ...overrides,
});

const coalition = (overrides: Partial<CoalitionFeedItem> & { id: string }): CoalitionFeedItem => ({
    kind: 'video',
    title: overrides.id,
    createdAt: new Date(NOW - HOUR).toISOString(),
    importance: 0.5,
    impact: 0.5,
    socialImpact: 0.5,
    score: 0.5,
    ...overrides,
});

const topic = (overrides: Partial<ColiseumTopic> & { id: string }): ColiseumTopic => ({
    title: overrides.id,
    newsAnchor: { sourceUrl: 'https://x', headline: 'Headline', publishedAt: '' },
    createdAt: new Date(NOW - HOUR).toISOString(),
    tags: [],
    status: 'active',
    recencyScore: 0.5,
    velocityScore: 0.5,
    debateHeat: 0.5,
    ...overrides,
});

const room = (overrides: Partial<RoomLike> & { roomId: string }): RoomLike => ({
    name: overrides.roomId,
    getType: () => 'm.room',
    getMyMembership: () => 'join',
    getLastActiveTimestamp: () => NOW - HOUR,
    getUnreadNotificationCount: () => 0,
    getCanonicalParent: () => null,
    ...overrides,
});

describe('mapStreams', () => {
    it('marks live streams and scores them above offline', () => {
        const [live, offline] = mapStreams(
            [stream({ id: 'b', state: 'offline' }), stream({ id: 'a', state: 'live' })],
            NOW
        ).sort((x, y) => x.id.localeCompare(y.id));
        expect(live.source).toBe('stream');
        expect(live.live).toBe(true);
        expect(live.badge).toBe('LIVE');
        expect(offline.live).toBe(false);
        expect(live.score).toBeGreaterThan(offline.score);
    });
});

describe('mapCoalition / mapColiseum', () => {
    it('normalizes coalition timestamps and reuses the server score', () => {
        const [item] = mapCoalition([coalition({ id: 'x', score: 0.8 })], NOW);
        expect(item.id).toBe('coalition:x');
        expect(item.score).toBe(0.8);
        expect(item.timestamp).toBe(NOW - HOUR);
    });

    it('uses debate heat as the coliseum score and the headline as subtitle', () => {
        const [item] = mapColiseum([topic({ id: 't', debateHeat: 0.9 })], NOW);
        expect(item.id).toBe('coliseum:t');
        expect(item.score).toBe(0.9);
        expect(item.subtitle).toBe('Headline');
    });
});

describe('mapMarketplace', () => {
    const listing = (
        overrides: Partial<NormalizedListing> & { providerListingId: string }
    ): NormalizedListing => ({
        providerId: 'freeblackmarket' as NormalizedListing['providerId'],
        category: 'plugin-curated' as NormalizedListing['category'],
        title: overrides.providerListingId,
        description: '',
        priceCents: 999,
        currency: 'USD',
        sellerId: null,
        mediaUrls: [],
        entitlementKind: 'digital_download' as NormalizedListing['entitlementKind'],
        ...overrides,
    });

    it('maps listings into Discover-only feed cards with a formatted price', () => {
        const [item] = mapMarketplace(
            [listing({ providerListingId: 'p1', priceCents: 1500, mediaUrls: ['https://img/x'] })],
            NOW
        );
        expect(item.source).toBe('marketplace');
        expect(item.id).toBe('marketplace:freeblackmarket:p1');
        expect(item.subtitle).toContain('$15.00');
        expect(item.mediaUrl).toBe('https://img/x');
        // No canopy → never enters the Following partition.
        expect(item.canopyId).toBeNull();
        expect(partitionFollowing([item], new Set())).toEqual([]);
    });
});

describe('mergeAndRank', () => {
    it('orders by score desc, dedupes by id, and respects the limit', () => {
        const items: UnifiedFeedItem[] = [
            ...mapCoalition([coalition({ id: 'low', score: 0.1 })], NOW),
            ...mapCoalition([coalition({ id: 'high', score: 0.9 })], NOW),
            ...mapCoalition([coalition({ id: 'high', score: 0.9 })], NOW), // duplicate id
        ];
        const ranked = mergeAndRank(items, { limit: 5 });
        expect(ranked.map((i) => i.id)).toEqual(['coalition:high', 'coalition:low']);
    });
});

describe('mapWallPosts', () => {
    it('normalizes wall posts with real timestamps and links to the owner profile', () => {
        const [item] = mapWallPosts(
            [
                {
                    id: 'p1',
                    ownerUserId: '@owner:s',
                    ownerDisplayName: 'Owner',
                    body: 'hello world',
                    authorId: '@author:s',
                    createdAt: new Date(NOW - HOUR).toISOString(),
                },
            ],
            NOW
        );
        expect(item.id).toBe('wall:p1');
        expect(item.source).toBe('wall');
        expect(item.title).toBe('Owner');
        expect(item.subtitle).toBe('hello world');
        expect(item.timestamp).toBe(NOW - HOUR);
        expect(item.href).toBe(`/creators/${encodeURIComponent('@owner:s')}`);
    });
});

describe('selectLiveRail', () => {
    it('returns only live streams', () => {
        const items = mapStreams(
            [stream({ id: 'a', state: 'live' }), stream({ id: 'b', state: 'offline' })],
            NOW
        );
        const rail = selectLiveRail(items);
        expect(rail.map((i) => i.id)).toEqual(['stream:a']);
    });
});

describe('partitionFollowing', () => {
    it('keeps den + status items and canopy-matched items only', () => {
        const dens = mapDens(
            [room({ roomId: '!d:s', getCanonicalParent: () => '!joined:s' })],
            NOW
        );
        const statuses = mapStatuses([{ userId: '@me:s', displayName: 'Me', text: 'hi' }], NOW);
        const inCanopy = mapCoalition([coalition({ id: 'in', canopyId: '!joined:s' })], NOW);
        const outCanopy = mapCoalition([coalition({ id: 'out', canopyId: '!other:s' })], NOW);
        const noCanopy = mapColiseum([topic({ id: 'global' })], NOW);

        const following = partitionFollowing(
            [...dens, ...statuses, ...inCanopy, ...outCanopy, ...noCanopy],
            new Set(['!joined:s'])
        );
        const ids = following.map((i) => i.id);
        expect(ids).toContain('den:!d:s');
        expect(ids).toContain('status:@me:s');
        expect(ids).toContain('coalition:in');
        expect(ids).not.toContain('coalition:out');
        expect(ids).not.toContain('coliseum:global');
    });
});
