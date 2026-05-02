import {
    AID_POST_CATEGORIES,
    AID_POST_STATUS,
    AID_POST_TYPES,
    AID_POST_URGENCY,
    SELLER_LOCATION_TYPES,
    SPATIAL_LAYER_KEYS,
    deriveDisplayStatus,
    deriveSpatialEventStatus,
    type AidPost,
    type CoalitionFeedItem,
    type SellerLocation,
    type SpatialFeedItem,
} from '@blackout/core';

const NOW_ISO = () => new Date().toISOString();

const seedFeed: CoalitionFeedItem[] = [
    {
        id: 'feed-video-1',
        kind: 'video',
        title: 'Garden plot tour',
        body: 'Coalition urban garden walkthrough',
        createdAt: '2026-04-30T18:00:00Z',
        canopyId: 'demo-canopy',
        denId: 'demo-den-gardens',
        authorId: '@vine:server',
        mediaUrl: 'https://cdn.example/coalition/garden-tour.mp4',
        importance: 0.6,
        impact: 0.5,
        socialImpact: 0.7,
        score: 0,
        tags: ['gardens', 'food'],
    },
    {
        id: 'feed-video-2',
        kind: 'video',
        title: 'Co-op assembly highlights',
        createdAt: '2026-05-01T14:00:00Z',
        canopyId: 'demo-canopy',
        denId: 'demo-den-governance',
        authorId: '@oak:server',
        mediaUrl: 'https://cdn.example/coalition/assembly.mp4',
        importance: 0.9,
        impact: 0.8,
        socialImpact: 0.85,
        score: 0,
        tags: ['governance'],
    },
    {
        id: 'feed-event-1',
        kind: 'event',
        title: 'Saturday food share',
        body: 'Free produce at Sunrise Farm Stand',
        createdAt: '2026-05-02T09:00:00Z',
        canopyId: 'demo-canopy',
        denId: 'demo-den-aid',
        importance: 0.7,
        impact: 0.4,
        socialImpact: 0.6,
        score: 0,
        tags: ['aid', 'food'],
    },
    {
        id: 'feed-listing-1',
        kind: 'listing',
        title: 'Hand-poured beeswax candles',
        body: '$8 each, pickup at storefront',
        createdAt: '2026-05-01T20:00:00Z',
        canopyId: 'demo-canopy',
        denId: 'demo-den-vendors',
        importance: 0.4,
        impact: 0.3,
        socialImpact: 0.4,
        score: 0,
        tags: ['vendors'],
    },
];

const seedSpatial: SpatialFeedItem[] = [
    {
        id: 'spatial-vendor-1',
        layer: 'vendors',
        title: 'Sunrise Farm Stand pop-up',
        latitude: 40.7128,
        longitude: -74.006,
        visibility: 'public',
        eventType: 'farm',
        startsAt: '2026-05-03T13:00:00Z',
        endsAt: '2026-05-03T18:00:00Z',
        status: deriveSpatialEventStatus({
            startsAt: '2026-05-03T13:00:00Z',
            endsAt: '2026-05-03T18:00:00Z',
        }),
        source: 'medusa',
    },
    {
        id: 'spatial-aid-1',
        layer: 'aid',
        title: 'Diaper bank restock',
        latitude: 40.7185,
        longitude: -74.012,
        visibility: 'community',
        eventType: 'aid',
        startsAt: '2026-05-02T09:00:00Z',
        endsAt: '2026-05-02T17:00:00Z',
        status: deriveSpatialEventStatus({
            startsAt: '2026-05-02T09:00:00Z',
            endsAt: '2026-05-02T17:00:00Z',
        }),
        severity: 'moderate',
        source: 'gateway',
    },
    {
        id: 'spatial-vote-1',
        layer: 'votes',
        title: 'Block proposal #BMC-019',
        latitude: 40.7079,
        longitude: -74.011,
        visibility: 'community',
        eventType: 'community_event',
        startsAt: '2026-05-02T18:30:00Z',
        endsAt: '2026-05-02T20:30:00Z',
        status: deriveSpatialEventStatus({
            startsAt: '2026-05-02T18:30:00Z',
            endsAt: '2026-05-02T20:30:00Z',
        }),
        source: 'blackout',
    },
];

const seedAid: AidPost[] = [
    {
        id: 'aidp_seed_1',
        customerId: '@vine:server',
        type: 'need',
        category: 'food',
        title: 'Diapers size 3 needed',
        description: 'Looking for a pack to tide a family over until Friday.',
        location: { latitude: 40.7185, longitude: -74.012 },
        displayRadiusMeters: 500,
        urgency: 'high',
        status: 'open',
        denId: '!demo-aid:server',
    },
    {
        id: 'aidp_seed_2',
        customerId: '@oak:server',
        type: 'offer',
        category: 'transport',
        title: 'Free rides to clinic Tuesday',
        description: 'Rides 9am-3pm within 5 miles. DM to coordinate.',
        location: { latitude: 40.7128, longitude: -74.006 },
        displayRadiusMeters: 8000,
        urgency: 'medium',
        status: 'open',
        denId: '!demo-aid:server',
    },
];

const seedSellers: SellerLocation[] = [
    {
        id: 'sloc_seed_1',
        sellerId: 'seller-sunrise-farm',
        coordinates: { latitude: 40.7128, longitude: -74.006 },
        addressLine: '12 Sunrise Way',
        city: 'New York',
        state: 'NY',
        zip: '10001',
        country: 'US',
        displayRadiusMeters: 1500,
        isVisible: true,
        locationType: 'farm',
    },
    {
        id: 'sloc_seed_2',
        sellerId: 'seller-beeswax-co',
        coordinates: { latitude: 40.715, longitude: -74.001 },
        addressLine: '88 Hive St',
        city: 'New York',
        state: 'NY',
        zip: '10001',
        country: 'US',
        displayRadiusMeters: 800,
        isVisible: true,
        locationType: 'storefront',
    },
];

const feedStore = new Map<string, CoalitionFeedItem>(
    seedFeed.map((item) => [item.id, item]),
);
const spatialStore = new Map<string, SpatialFeedItem>(
    seedSpatial.map((item) => [item.id, item]),
);
const aidStore = new Map<string, AidPost>(seedAid.map((post) => [post.id, post]));
const sellerStore = new Map<string, SellerLocation>(
    seedSellers.map((location) => [location.id, location]),
);

export interface FeedFilter {
    canopyId?: string;
    denId?: string;
    kind?: CoalitionFeedItem['kind'];
}

export function listFeedItems(filter: FeedFilter = {}): CoalitionFeedItem[] {
    const all = [...feedStore.values()];
    return all.filter((item) => {
        if (filter.canopyId && item.canopyId !== filter.canopyId) return false;
        if (filter.denId && item.denId !== filter.denId) return false;
        if (filter.kind && item.kind !== filter.kind) return false;
        return true;
    });
}

export interface SpatialFilter {
    layers?: string[];
    canopyId?: string;
}

export function listSpatialItems(filter: SpatialFilter = {}): SpatialFeedItem[] {
    const allowed = new Set(
        filter.layers && filter.layers.length > 0
            ? filter.layers.filter((key) =>
                  (SPATIAL_LAYER_KEYS as readonly string[]).includes(key),
              )
            : SPATIAL_LAYER_KEYS,
    );
    return [...spatialStore.values()].filter((item) => allowed.has(item.layer));
}

export function listAidPosts(filter: { denId?: string } = {}): AidPost[] {
    const now = Date.now();
    return [...aidStore.values()]
        .map((post) => ({ ...post, status: deriveDisplayStatus(post, now) }))
        .filter((post) => (filter.denId ? post.denId === filter.denId : true));
}

export function createAidPost(post: AidPost): AidPost {
    aidStore.set(post.id, post);
    return post;
}

export function listSellerLocations(filter: { onlyVisible?: boolean } = {}): SellerLocation[] {
    return [...sellerStore.values()].filter((location) =>
        filter.onlyVisible ? location.isVisible : true,
    );
}

export const COALITION_AID_TYPES = AID_POST_TYPES;
export const COALITION_AID_CATEGORIES = AID_POST_CATEGORIES;
export const COALITION_AID_URGENCY = AID_POST_URGENCY;
export const COALITION_AID_STATUS = AID_POST_STATUS;
export const COALITION_SELLER_TYPES = SELLER_LOCATION_TYPES;

export function newAidId(): string {
    return `aidp_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function nowIso(): string {
    return NOW_ISO();
}
