import { describe, expect, it } from 'vitest';
import {
    emptyFeedReason,
    formatRelayPath,
    groupConsecutive,
    provenanceSummary,
    relayPathLabels,
    RUN_COLLAPSE_THRESHOLD,
    shouldCollapse,
} from '../../../../src/app/features/circle-feed/circleFeedModel';
import type {
    CircleFeedItem,
    RelayHopView,
} from '../../../../src/app/features/circle-feed/circleFeedClient';

const hop = (userId: string, overrides: Partial<RelayHopView> = {}): RelayHopView => ({
    relayId: `relay-${userId}`,
    userId,
    note: null,
    active: true,
    at: '2026-09-01T00:00:00.000Z',
    ...overrides,
});

const item = (overrides: Partial<CircleFeedItem> = {}): CircleFeedItem => ({
    key: 'coalition_feed:item-1',
    ring: 'reach',
    at: '2026-09-01T00:00:00.000Z',
    subject: {
        source: 'coalition_feed',
        id: 'item-1',
        title: 'Produce share',
        body: null,
        authorId: '@author:s',
        createdAt: '2026-09-01T00:00:00.000Z',
        mediaUrl: null,
        tags: [],
    },
    path: null,
    alsoRelayedBy: [],
    ...overrides,
});

const name = (userId: string) => /^@([^:\s]+):/.exec(userId)?.[1] ?? userId;

describe('relayPathLabels', () => {
    it('puts the viewer first and keeps every relayer after them', () => {
        const labels = relayPathLabels([hop('@alice:s'), hop('@bob:s')], '@me:s');
        expect(labels.map((l) => l.userId)).toEqual(['@me:s', '@alice:s', '@bob:s']);
        expect(labels[0]?.isViewer).toBe(true);
    });

    it('keeps a withdrawn relayer in the line rather than dropping them', () => {
        // The item genuinely travelled through them; removing the hop would
        // misrepresent how it arrived.
        const labels = relayPathLabels([hop('@alice:s', { active: false })], '@me:s');
        expect(labels).toHaveLength(2);
        expect(labels[1]?.active).toBe(false);
    });

    it('marks the viewer’s own hop when they are inside the chain', () => {
        const labels = relayPathLabels([hop('@me:s'), hop('@bob:s')], '@me:s');
        expect(labels.filter((l) => l.isViewer)).toHaveLength(2);
    });
});

describe('formatRelayPath', () => {
    it('renders the [You] → [X] → [Y] line', () => {
        const labels = relayPathLabels([hop('@alice:s'), hop('@bob:s')], '@me:s');
        expect(formatRelayPath(labels, name)).toBe('You → alice → bob');
    });
});

describe('provenanceSummary', () => {
    it('names the author for a Circle item', () => {
        expect(provenanceSummary(item({ ring: 'circle' }), name)).toBe('author posted this');
    });

    it('names the nearest relayer for a Reach item', () => {
        expect(
            provenanceSummary(
                item({ path: { hops: [hop('@alice:s')], originAuthorId: null, length: 1 } }),
                name
            )
        ).toBe('alice relayed this');
    });

    it('counts the other relayers without hiding them', () => {
        const summary = provenanceSummary(
            item({
                path: { hops: [hop('@alice:s')], originAuthorId: null, length: 1 },
                alsoRelayedBy: ['@bob:s', '@carol:s'],
            }),
            name
        );
        expect(summary).toBe('alice relayed this, and 2 others');
    });
});

describe('groupConsecutive', () => {
    it('folds a run by one relayer and starts a new group when the relayer changes', () => {
        const alice = { hops: [hop('@alice:s')], originAuthorId: null, length: 1 };
        const bob = { hops: [hop('@bob:s')], originAuthorId: null, length: 1 };
        const groups = groupConsecutive([
            item({ key: 'a', path: alice }),
            item({ key: 'b', path: alice }),
            item({ key: 'c', path: bob }),
        ]);
        expect(groups).toHaveLength(2);
        expect(groups[0]?.items.map((i) => i.key)).toEqual(['a', 'b']);
        expect(groups[1]?.relayerUserId).toBe('@bob:s');
    });

    it('never merges Circle-authored items, which have no relayer', () => {
        const groups = groupConsecutive([
            item({ key: 'a', ring: 'circle' }),
            item({ key: 'b', ring: 'circle' }),
        ]);
        expect(groups).toHaveLength(2);
    });

    it('preserves order exactly — grouping is presentation, not ranking', () => {
        const alice = { hops: [hop('@alice:s')], originAuthorId: null, length: 1 };
        const input = ['a', 'b', 'c'].map((key) => item({ key, path: alice }));
        const flattened = groupConsecutive(input).flatMap((g) => g.items.map((i) => i.key));
        expect(flattened).toEqual(['a', 'b', 'c']);
    });
});

describe('shouldCollapse', () => {
    const alice = { hops: [hop('@alice:s')], originAuthorId: null, length: 1 };

    it('collapses a run only once it reaches the threshold', () => {
        const short = groupConsecutive(
            Array.from({ length: RUN_COLLAPSE_THRESHOLD - 1 }, (_, i) =>
                item({ key: `k${i}`, path: alice })
            )
        )[0]!;
        expect(shouldCollapse(short)).toBe(false);

        const long = groupConsecutive(
            Array.from({ length: RUN_COLLAPSE_THRESHOLD }, (_, i) =>
                item({ key: `k${i}`, path: alice })
            )
        )[0]!;
        expect(shouldCollapse(long)).toBe(true);
    });
});

describe('emptyFeedReason', () => {
    it('points an unconnected viewer at Discover rather than implying a fault', () => {
        const reason = emptyFeedReason(0);
        expect(reason).toContain('Your Circle is empty');
        expect(reason).toContain('Discover');
    });

    it('says plainly that a populated Circle has simply been quiet', () => {
        expect(emptyFeedReason(4)).toContain('has posted or relayed');
    });
});
