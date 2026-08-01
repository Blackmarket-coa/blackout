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
    getMember: () => null,
    ...overrides,
});

/** DM exclusion inputs are required (fail closed); this is the "no DMs" base. */
const noDms = { dmRoomIds: new Set<string>(), myUserId: null };

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
            now,
            noDms
        );

        expect(items.map((i) => i.denId)).toEqual(['!den:s']);
    });

    it('drops rooms registered in m.direct and keeps real dens', () => {
        const rooms = [
            fakeRoom({ roomId: '!dm:s', name: 'friend', getLastActiveTimestamp: () => now }),
            fakeRoom({
                roomId: '!den:s',
                name: 'Mutual aid den',
                getLastActiveTimestamp: () => now,
            }),
        ];

        const items = buildHomeFeed(rooms, now, {
            dmRoomIds: new Set(['!dm:s']),
            myUserId: null,
        });
        expect(items.map((i) => i.denId)).toEqual(['!den:s']);
    });

    it('drops DMs only detectable via is_direct on our own member event', () => {
        // The DM never made it into m.direct (e.g. created without the
        // registration), but the direct invite stamped is_direct on the
        // recipient's member event.
        const rooms = [
            fakeRoom({
                roomId: '!unregistered-dm:s',
                name: 'friend',
                getLastActiveTimestamp: () => now,
                getMember: (userId: string) =>
                    userId === '@me:s'
                        ? {
                              events: {
                                  member: {
                                      getContent: () => ({
                                          membership: 'join',
                                          is_direct: true,
                                      }),
                                  },
                              },
                          }
                        : null,
            }),
            fakeRoom({
                roomId: '!den:s',
                name: 'Mutual aid den',
                getLastActiveTimestamp: () => now,
            }),
        ];

        const items = buildHomeFeed(rooms, now, {
            dmRoomIds: new Set<string>(),
            myUserId: '@me:s',
        });
        expect(items.map((i) => i.denId)).toEqual(['!den:s']);
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
            now,
            noDms
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
        expect(buildHomeFeed(rooms, now, { ...noDms, limit: 10 })).toHaveLength(10);
        expect(buildHomeFeed(rooms, now, noDms)).toHaveLength(50);
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
            now,
            noDms
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
            now,
            noDms
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
            now,
            noDms
        );

        const groups = groupHomeFeedByBucket(items);
        expect(groups.map((g) => g.bucket)).toEqual(['today', 'this-week', 'older']);
        expect(groups[0].items[0].denId).toBe('!t1:s');
    });

    it('omits empty buckets', () => {
        const items = buildHomeFeed(
            [fakeRoom({ roomId: '!t:s', getLastActiveTimestamp: () => now })],
            now,
            noDms
        );
        const groups = groupHomeFeedByBucket(items);
        expect(groups.map((g) => g.bucket)).toEqual(['today']);
    });
});
