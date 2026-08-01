import { describe, expect, it } from 'vitest';
import {
    DiscoveryFilters,
    DiscoveryItem,
    filterDiscoveryItems,
    isLikelySandbox,
    rankDiscoveryItems,
    sortDiscoveryItems,
} from '../../../../src/app/features/discovery/model';

const makeItem = (overrides: Partial<DiscoveryItem>): DiscoveryItem => ({
    roomId: '!r:hs',
    roomIdOrAlias: '!r:hs',
    name: 'General',
    memberCount: 10,
    joined: false,
    lastActivityTs: 0,
    inHierarchy: false,
    parentSpaceIds: [],
    ...overrides,
});

const allFilters: DiscoveryFilters = { type: 'all', access: 'all', activity: 'all' };

describe('isLikelySandbox', () => {
    it('flags rooms with zero or one member, but not two', () => {
        expect(isLikelySandbox(makeItem({ memberCount: 0 }))).toBe(true);
        expect(isLikelySandbox(makeItem({ memberCount: 1 }))).toBe(true);
        expect(isLikelySandbox(makeItem({ memberCount: 2 }))).toBe(false);
    });
});

describe('sandbox filtering (includeEmpty)', () => {
    const items = [
        makeItem({ roomId: '!empty:hs', memberCount: 0 }),
        makeItem({ roomId: '!solo:hs', memberCount: 1 }),
        makeItem({ roomId: '!pair:hs', memberCount: 2 }),
        makeItem({ roomId: '!busy:hs', memberCount: 50 }),
    ];

    it('hides 0- and 1-member rooms by default (includeEmpty omitted)', () => {
        const result = filterDiscoveryItems(items, allFilters);
        expect(result.map((it) => it.roomId)).toEqual(['!pair:hs', '!busy:hs']);
    });

    it('hides 0- and 1-member rooms when includeEmpty is explicitly false', () => {
        const result = filterDiscoveryItems(items, { ...allFilters, includeEmpty: false });
        expect(result.map((it) => it.roomId)).toEqual(['!pair:hs', '!busy:hs']);
    });

    it('keeps the boundary memberCount=2 room visible by default', () => {
        const result = filterDiscoveryItems(
            [makeItem({ roomId: '!pair:hs', memberCount: 2 })],
            allFilters
        );
        expect(result.map((it) => it.roomId)).toEqual(['!pair:hs']);
    });

    it('shows sandbox rooms when the includeEmpty toggle is on', () => {
        const result = filterDiscoveryItems(items, { ...allFilters, includeEmpty: true });
        expect(result.map((it) => it.roomId)).toEqual([
            '!empty:hs',
            '!solo:hs',
            '!pair:hs',
            '!busy:hs',
        ]);
    });

    it('never hides sandbox canopies the user has joined', () => {
        const withJoined = [
            makeItem({ roomId: '!mine:hs', memberCount: 1, joined: true }),
            makeItem({ roomId: '!other:hs', memberCount: 1, joined: false }),
        ];

        const result = filterDiscoveryItems(withJoined, allFilters);
        expect(result.map((it) => it.roomId)).toEqual(['!mine:hs']);

        // The joined item also survives the access=joined chip combination.
        const joinedOnly = filterDiscoveryItems(withJoined, { ...allFilters, access: 'joined' });
        expect(joinedOnly.map((it) => it.roomId)).toEqual(['!mine:hs']);
    });

    it('composes with the other chips end-to-end via rankDiscoveryItems', () => {
        const mixed = [
            makeItem({ roomId: '!sandbox:hs', memberCount: 1, lastActivityTs: 99 }),
            makeItem({ roomId: '!real:hs', memberCount: 20, lastActivityTs: 5 }),
        ];

        const result = rankDiscoveryItems(mixed, allFilters, 'recency');
        expect(result.map((it) => it.roomId)).toEqual(['!real:hs']);
    });
});

describe('relevance sort demotes sandbox rooms', () => {
    const items = [
        makeItem({ roomId: '!sandboxExact:hs', name: 'alpha', memberCount: 1 }),
        makeItem({
            roomId: '!weakMatch:hs',
            name: 'Chat',
            topic: 'alpha friendly',
            memberCount: 30,
        }),
        makeItem({ roomId: '!prefix:hs', name: 'Alpha den', memberCount: 8 }),
    ];

    it('sinks sandbox items below every non-sandbox match even with a better score', () => {
        // The sandbox room is an exact name match (highest relevance score), yet
        // it must land after both non-sandbox rooms.
        const result = sortDiscoveryItems(items, 'relevance', 'alpha');
        expect(result.map((it) => it.roomId)).toEqual([
            '!prefix:hs',
            '!weakMatch:hs',
            '!sandboxExact:hs',
        ]);
    });

    it('demotes even when the includeEmpty toggle shows sandbox rooms', () => {
        const result = rankDiscoveryItems(
            items,
            { ...allFilters, includeEmpty: true },
            'relevance',
            'alpha'
        );
        expect(result.map((it) => it.roomId)).toEqual([
            '!prefix:hs',
            '!weakMatch:hs',
            '!sandboxExact:hs',
        ]);
    });

    it('demotes without a search term too', () => {
        const noTerm = sortDiscoveryItems(
            [
                makeItem({ roomId: '!solo:hs', memberCount: 1 }),
                makeItem({ roomId: '!busy:hs', memberCount: 40 }),
            ],
            'relevance'
        );
        expect(noTerm.map((it) => it.roomId)).toEqual(['!busy:hs', '!solo:hs']);
    });

    it('leaves non-relevance sorts alone (recency still ranks a fresh sandbox first)', () => {
        const byRecency = sortDiscoveryItems(
            [
                makeItem({ roomId: '!sandboxFresh:hs', memberCount: 1, lastActivityTs: 100 }),
                makeItem({ roomId: '!busyOld:hs', memberCount: 40, lastActivityTs: 1 }),
            ],
            'recency'
        );
        expect(byRecency.map((it) => it.roomId)).toEqual(['!sandboxFresh:hs', '!busyOld:hs']);
    });
});
