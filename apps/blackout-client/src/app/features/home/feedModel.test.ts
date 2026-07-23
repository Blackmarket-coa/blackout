import { describe, expect, it } from 'vitest';
import { buildHomeFeed, groupHomeFeedByBucket, resolveBucket, type RoomLike } from './feedModel';

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

const fakeRoom = (overrides: Partial<RoomLike> & { roomId: string; name?: string }): RoomLike => ({
    name: overrides.name ?? overrides.roomId,
    getType: () => 'm.room',
    getMyMembership: () => 'join',
    getLastActiveTimestamp: () => 0,
    getUnreadNotificationCount: () => 0,
    getCanonicalParent: () => null,
    ...overrides,
});

describe('resolveBucket', () => {
    const now = 1_700_000_000_000;
    it('returns "today" for activity within 24h', () => {
        expect(resolveBucket(now - 1, now)).toBe('today');
        expect(resolveBucket(now - ONE_DAY + 1, now)).toBe('today');
    });
    it('returns "this-week" for activity within 7d but past 24h', () => {
        expect(resolveBucket(now - ONE_DAY, now)).toBe('this-week');
        expect(resolveBucket(now - 6 * ONE_DAY, now)).toBe('this-week');
    });
    it('returns "older" for activity past 7d and for null', () => {
        expect(resolveBucket(now - 7 * ONE_DAY, now)).toBe('older');
        expect(resolveBucket(null, now)).toBe('older');
    });
});

describe('buildHomeFeed', () => {
    const now = 1_700_000_000_000;

    it('drops canopies (m.space) and non-joined rooms', () => {
        const items = buildHomeFeed(
            [
                fakeRoom({
                    roomId: '!canopy:s',
                    name: 'Shared canopy',
                    getType: () => 'm.space',
                }),
                fakeRoom({
                    roomId: '!invited:s',
                    name: 'Pending invite',
                    getMyMembership: () => 'invite',
                }),
                fakeRoom({
                    roomId: '!den:s',
                    name: 'Mutual aid den',
                    getLastActiveTimestamp: () => now,
                }),
            ],
            now
        );

        expect(items.map((i) => i.denId)).toEqual(['!den:s']);
    });

    it('drops DM rooms when their ids are passed via dmRoomIds', () => {
        const rooms = [
            fakeRoom({ roomId: '!dm:s', name: 'friend', getLastActiveTimestamp: () => now }),
            fakeRoom({
                roomId: '!den:s',
                name: 'Mutual aid den',
                getLastActiveTimestamp: () => now,
            }),
        ];

        const withExclusion = buildHomeFeed(rooms, now, { dmRoomIds: new Set(['!dm:s']) });
        expect(withExclusion.map((i) => i.denId)).toEqual(['!den:s']);

        // Without the option every joined non-space room still qualifies.
        const withoutExclusion = buildHomeFeed(rooms, now);
        expect(withoutExclusion.map((i) => i.denId).sort()).toEqual(['!den:s', '!dm:s']);
    });

    it('orders by lastActiveAt desc and tie-breaks on name', () => {
        const items = buildHomeFeed(
            [
                fakeRoom({
                    roomId: '!a:s',
                    name: 'Alpha',
                    getLastActiveTimestamp: () => now - 5 * ONE_DAY,
                }),
                fakeRoom({
                    roomId: '!b:s',
                    name: 'Bravo',
                    getLastActiveTimestamp: () => now - 2 * ONE_HOUR,
                }),
                fakeRoom({
                    roomId: '!c:s',
                    name: 'Charlie',
                    getLastActiveTimestamp: () => now - 2 * ONE_HOUR,
                }),
                fakeRoom({
                    roomId: '!silent:s',
                    name: 'Silent',
                    getLastActiveTimestamp: () => 0,
                }),
            ],
            now
        );

        expect(items.map((i) => i.denId)).toEqual([
            '!b:s', // 2h ago, alphabetically first among ties
            '!c:s', // 2h ago
            '!a:s', // 5d ago
            '!silent:s', // null (no activity)
        ]);
    });

    it('respects the configured limit', () => {
        const rooms = Array.from({ length: 60 }, (_, i) =>
            fakeRoom({
                roomId: `!d${i}:s`,
                name: `Den ${i}`,
                getLastActiveTimestamp: () => now - i,
            })
        );
        expect(buildHomeFeed(rooms, now, { limit: 10 })).toHaveLength(10);
        expect(buildHomeFeed(rooms, now)).toHaveLength(50);
    });

    it('captures parent canopy id when the room reports one', () => {
        const items = buildHomeFeed(
            [
                fakeRoom({
                    roomId: '!d:s',
                    name: 'Den',
                    getLastActiveTimestamp: () => now,
                    getCanonicalParent: () => '!canopy:s',
                }),
            ],
            now
        );
        expect(items[0]?.canopyId).toBe('!canopy:s');
    });

    it('produces friendly subtitles per bucket', () => {
        const items = buildHomeFeed(
            [
                fakeRoom({
                    roomId: '!recent:s',
                    name: 'Recent',
                    getLastActiveTimestamp: () => now - 30 * 1000,
                }),
                fakeRoom({
                    roomId: '!hours:s',
                    name: 'Hours',
                    getLastActiveTimestamp: () => now - 3 * ONE_HOUR,
                }),
                fakeRoom({
                    roomId: '!days:s',
                    name: 'Days',
                    getLastActiveTimestamp: () => now - 3 * ONE_DAY,
                }),
                fakeRoom({
                    roomId: '!cold:s',
                    name: 'Cold',
                    getLastActiveTimestamp: () => 0,
                }),
            ],
            now
        );

        const map = Object.fromEntries(items.map((i) => [i.denId, i.subtitle]));
        expect(map['!recent:s']).toBe('Active just now');
        expect(map['!hours:s']).toBe('Active 3h ago');
        expect(map['!days:s']).toBe('Active 3d ago');
        expect(map['!cold:s']).toBe('No recent activity yet.');
    });
});

describe('groupHomeFeedByBucket', () => {
    const now = 1_700_000_000_000;
    it('groups items into today/this-week/older preserving order', () => {
        const items = buildHomeFeed(
            [
                fakeRoom({ roomId: '!t1:s', getLastActiveTimestamp: () => now - 60 * 1000 }),
                fakeRoom({
                    roomId: '!w1:s',
                    getLastActiveTimestamp: () => now - 3 * ONE_DAY,
                }),
                fakeRoom({
                    roomId: '!o1:s',
                    getLastActiveTimestamp: () => now - 30 * ONE_DAY,
                }),
            ],
            now
        );

        const groups = groupHomeFeedByBucket(items);
        expect(groups.map((g) => g.bucket)).toEqual(['today', 'this-week', 'older']);
        expect(groups[0].items[0].denId).toBe('!t1:s');
    });

    it('omits empty buckets', () => {
        const items = buildHomeFeed(
            [fakeRoom({ roomId: '!t:s', getLastActiveTimestamp: () => now })],
            now
        );
        const groups = groupHomeFeedByBucket(items);
        expect(groups.map((g) => g.bucket)).toEqual(['today']);
    });
});
