import { describe, expect, it } from 'vitest';
import type { CoalitionFeedItem, ColiseumTopic, NormalizedListing } from '@blackout/core';
import type { StreamSummary } from '../streams/streamsClient';
import type { RoomLike } from './feedModel';
import {
    mapCoalition,
    mapColiseum,
    mapDens,
    mapGovernance,
    mapMarketplace,
    mapStatuses,
    mapStreams,
    mapWallPosts,
    mergeAndRank,
    partitionFollowing,
    selectLiveRail,
    seriesNameFromTags,
    withSeriesBadges,
    type GovernanceProposalEntry,
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

describe('mapGovernance', () => {
    const proposal = (
        overrides: Partial<GovernanceProposalEntry> & { proposalEventId: string }
    ): GovernanceProposalEntry => ({
        canopyId: '!canopy:s',
        title: 'Fund the tool library',
        status: 'active',
        proposalType: 'binary',
        createdAt: NOW - HOUR,
        ...overrides,
    });

    it('flags active proposals with a VOTE badge and ranks them high', () => {
        const [item] = mapGovernance([proposal({ proposalEventId: 'p1' })], NOW);
        expect(item.id).toBe('governance:p1');
        expect(item.source).toBe('governance');
        expect(item.badge).toBe('VOTE');
        expect(item.subtitle).toBe('Vote open · Yes/no vote');
        expect(item.score).toBeGreaterThan(0.9);
        expect(item.href).toBe('/governance');
        expect(item.canopyId).toBe('!canopy:s');
    });

    it('demotes settled proposals and drops the badge', () => {
        const [item] = mapGovernance(
            [proposal({ proposalEventId: 'p2', status: 'passed', createdAt: NOW - HOUR })],
            NOW
        );
        expect(item.badge).toBeUndefined();
        expect(item.subtitle.startsWith('Passed · ')).toBe(true);
        expect(item.score).toBeLessThan(0.5);
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

    it('boosts items whose tags match boostTags above higher-scored non-matches', () => {
        const items: UnifiedFeedItem[] = [
            ...mapCoalition([coalition({ id: 'plain', score: 0.6, tags: ['news'] })], NOW),
            ...mapCoalition([coalition({ id: 'liked', score: 0.5, tags: ['music'] })], NOW),
        ];
        const withoutBoost = mergeAndRank(items);
        expect(withoutBoost.map((i) => i.id)).toEqual(['coalition:plain', 'coalition:liked']);

        const withBoost = mergeAndRank(items, { boostTags: new Set(['music']) });
        // 0.5 + 0.15 boost = 0.65 > 0.6, so the matching item ranks first.
        expect(withBoost.map((i) => i.id)).toEqual(['coalition:liked', 'coalition:plain']);
    });

    it('does not mutate the base score of boosted items', () => {
        const items = mapCoalition([coalition({ id: 'm', score: 0.5, tags: ['music'] })], NOW);
        mergeAndRank(items, { boostTags: new Set(['music']) });
        expect(items[0].score).toBe(0.5);
    });

    it('leaves ordering unchanged when boostTags is empty', () => {
        const items: UnifiedFeedItem[] = [
            ...mapCoalition([coalition({ id: 'a', score: 0.9, tags: ['x'] })], NOW),
            ...mapCoalition([coalition({ id: 'b', score: 0.1, tags: ['y'] })], NOW),
        ];
        const ranked = mergeAndRank(items, { boostTags: new Set() });
        expect(ranked.map((i) => i.id)).toEqual(['coalition:a', 'coalition:b']);
    });

    it('sorts by newest-first under the "new" mode regardless of score', () => {
        const items: UnifiedFeedItem[] = [
            ...mapCoalition(
                [
                    {
                        ...coalition({ id: 'old-high', score: 0.9 }),
                        createdAt: new Date(NOW - 5 * HOUR).toISOString(),
                    },
                ],
                NOW
            ),
            ...mapCoalition(
                [
                    {
                        ...coalition({ id: 'new-low', score: 0.1 }),
                        createdAt: new Date(NOW - HOUR).toISOString(),
                    },
                ],
                NOW
            ),
        ];
        const ranked = mergeAndRank(items, { sort: 'new', now: NOW });
        expect(ranked.map((i) => i.id)).toEqual(['coalition:new-low', 'coalition:old-high']);
    });

    it('ranks by score under "top", ignoring recency', () => {
        const items: UnifiedFeedItem[] = [
            ...mapCoalition(
                [
                    {
                        ...coalition({ id: 'old-high', score: 0.9 }),
                        createdAt: new Date(NOW - 5 * HOUR).toISOString(),
                    },
                ],
                NOW
            ),
            ...mapCoalition(
                [
                    {
                        ...coalition({ id: 'new-low', score: 0.1 }),
                        createdAt: new Date(NOW - HOUR).toISOString(),
                    },
                ],
                NOW
            ),
        ];
        const ranked = mergeAndRank(items, { sort: 'top', now: NOW });
        expect(ranked.map((i) => i.id)).toEqual(['coalition:old-high', 'coalition:new-low']);
    });

    it('lets a fresher item outrank a higher-scored stale one under "hot"', () => {
        const items: UnifiedFeedItem[] = [
            ...mapCoalition(
                [
                    {
                        ...coalition({ id: 'stale', score: 0.6 }),
                        createdAt: new Date(NOW - 6.9 * 24 * HOUR).toISOString(),
                    },
                ],
                NOW
            ),
            ...mapCoalition(
                [
                    {
                        ...coalition({ id: 'fresh', score: 0.5 }),
                        createdAt: new Date(NOW).toISOString(),
                    },
                ],
                NOW
            ),
        ];
        // hot: stale = 0.6*0.7 + ~0*0.3 = 0.42; fresh = 0.5*0.7 + 1*0.3 = 0.65.
        const ranked = mergeAndRank(items, { sort: 'hot', now: NOW });
        expect(ranked.map((i) => i.id)).toEqual(['coalition:fresh', 'coalition:stale']);
    });

    it('caps a flooding source so lower-scored other sources still make the cut', () => {
        const items: UnifiedFeedItem[] = [
            ...mapCoalition(
                [
                    coalition({ id: 'c1', score: 0.9 }),
                    coalition({ id: 'c2', score: 0.8 }),
                    coalition({ id: 'c3', score: 0.7 }),
                    coalition({ id: 'c4', score: 0.6 }),
                ],
                NOW
            ),
            ...mapColiseum([topic({ id: 't1', debateHeat: 0.5 })], NOW),
        ];
        const ranked = mergeAndRank(items, { limit: 3, maxPerSource: 2, now: NOW });
        // Without the cap the top 3 would be all-coalition.
        expect(ranked.map((i) => i.id)).toEqual(['coalition:c1', 'coalition:c2', 'coliseum:t1']);
    });

    it('backfills capped overflow rather than shrinking a scarce feed', () => {
        const items = mapCoalition(
            [
                coalition({ id: 'c1', score: 0.9 }),
                coalition({ id: 'c2', score: 0.8 }),
                coalition({ id: 'c3', score: 0.7 }),
                coalition({ id: 'c4', score: 0.6 }),
            ],
            NOW
        );
        const ranked = mergeAndRank(items, { limit: 3, maxPerSource: 2, now: NOW });
        // Only one source exists, so overflow fills the remaining slot in rank order.
        expect(ranked.map((i) => i.id)).toEqual(['coalition:c1', 'coalition:c2', 'coalition:c3']);
    });

    it('skips the cap when all candidates already fit within the limit', () => {
        const items: UnifiedFeedItem[] = [
            ...mapCoalition(
                [
                    coalition({ id: 'c1', score: 0.9 }),
                    coalition({ id: 'c2', score: 0.8 }),
                    coalition({ id: 'c3', score: 0.7 }),
                ],
                NOW
            ),
            ...mapColiseum([topic({ id: 't1', debateHeat: 0.5 })], NOW),
        ];
        const ranked = mergeAndRank(items, { limit: 10, maxPerSource: 2, now: NOW });
        expect(ranked.map((i) => i.id)).toEqual([
            'coalition:c1',
            'coalition:c2',
            'coalition:c3',
            'coliseum:t1',
        ]);
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

describe('series badges', () => {
    it('extracts the series name from a series:<name> tag, case-insensitively', () => {
        expect(seriesNameFromTags(['news', 'Series:Weekly Roundup'])).toBe('Weekly Roundup');
        expect(seriesNameFromTags(['music'])).toBeNull();
        expect(seriesNameFromTags(['series:'])).toBeNull();
    });

    it('badges items carrying a series tag but never overwrites an existing badge', () => {
        const seriesTopic = mapColiseum([topic({ id: 's', tags: ['series:Debate Club'] })], NOW);
        const plainTopic = mapColiseum([topic({ id: 'p', tags: ['news'] })], NOW);
        const liveStream = mapStreams(
            [stream({ id: 'l', state: 'live', tags: ['series:Live'] })],
            NOW
        );

        const [badged] = withSeriesBadges(seriesTopic);
        expect(badged.badge).toBe('SERIES');

        const [plain] = withSeriesBadges(plainTopic);
        expect(plain.badge).toBeUndefined();

        // The live stream already carries a LIVE badge, which wins.
        const [live] = withSeriesBadges(liveStream);
        expect(live.badge).toBe('LIVE');
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
