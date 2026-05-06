import { describe, expect, it } from 'vitest';
import {
    buildEventDirectory,
    collectEventsFromRoom,
    splitEventsByTimeline,
    type EventStateLike,
    type RoomWithStateLike,
} from './eventModel';

const ONE_DAY = 24 * 60 * 60 * 1000;

const fakeStateEvent = (overrides: {
    id: string;
    content: Record<string, unknown> | null;
    ts?: number;
}): EventStateLike => ({
    getId: () => overrides.id,
    getContent: () => overrides.content,
    getTs: () => overrides.ts ?? 0,
});

const fakeRoom = (
    roomId: string,
    states: EventStateLike[],
    overrides: Partial<RoomWithStateLike> = {}
): RoomWithStateLike => ({
    roomId,
    name: roomId,
    getEventState: () => states,
    getMyMembership: () => 'join',
    ...overrides,
});

describe('collectEventsFromRoom', () => {
    const now = Date.parse('2025-06-01T00:00:00Z');

    it('drops malformed and missing-required-field events', () => {
        const room = fakeRoom('!c:s', [
            fakeStateEvent({ id: '$bad-1', content: null }),
            fakeStateEvent({
                id: '$bad-2',
                content: {
                    title: 'no description',
                    startsAt: new Date(now).toISOString(),
                },
            }),
            fakeStateEvent({ id: '$bad-3', content: { title: 'x', description: 'y' } }),
            fakeStateEvent({
                id: '$ok-1',
                content: {
                    title: 'Aid drive',
                    description: 'Bring jackets',
                    startsAt: new Date(now).toISOString(),
                },
            }),
        ]);
        const items = collectEventsFromRoom(room);
        expect(items.map((item) => item.eventId)).toEqual(['$ok-1']);
        expect(items[0].id).toBe('!c:s:$ok-1');
    });

    it('skips rooms the user has not joined', () => {
        const room = fakeRoom(
            '!c:s',
            [
                fakeStateEvent({
                    id: '$ok',
                    content: {
                        title: 'A',
                        description: 'B',
                        startsAt: new Date(now).toISOString(),
                    },
                }),
            ],
            { getMyMembership: () => 'leave' }
        );
        expect(collectEventsFromRoom(room)).toEqual([]);
    });

    it('normalizes tags to lowercase + trims and falls back to [] when missing', () => {
        const room = fakeRoom('!c:s', [
            fakeStateEvent({
                id: '$tagged',
                content: {
                    title: 'Tagged',
                    description: 'has tags',
                    startsAt: new Date(now).toISOString(),
                    tags: ['Mutual-Aid ', 'GARDEN', '   '],
                },
            }),
        ]);
        const items = collectEventsFromRoom(room);
        expect(items[0].tags).toEqual(['mutual-aid', 'garden']);
    });
});

describe('buildEventDirectory', () => {
    const now = Date.parse('2025-06-01T00:00:00Z');

    const event = (
        id: string,
        startsAtMs: number,
        title = `Event ${id}`,
        roomId = '!c:s'
    ): EventStateLike =>
        fakeStateEvent({
            id,
            content: {
                title,
                description: 'desc',
                startsAt: new Date(startsAtMs).toISOString(),
            },
            ts: startsAtMs - ONE_DAY,
        });

    it('orders upcoming-first chronological then past reverse-chrono', () => {
        const rooms: RoomWithStateLike[] = [
            fakeRoom('!c:s', [
                event('$past1', now - 5 * ONE_DAY, 'Past1'),
                event('$soon', now + ONE_DAY, 'Soon'),
                event('$later', now + 7 * ONE_DAY, 'Later'),
                event('$past2', now - 1 * ONE_DAY, 'Past2'),
            ]),
        ];
        const items = buildEventDirectory(rooms, now);
        expect(items.map((item) => item.eventId)).toEqual(['$soon', '$later', '$past2', '$past1']);
    });

    it('respects the limit parameter', () => {
        const rooms = [
            fakeRoom(
                '!c:s',
                Array.from({ length: 10 }, (_, i) => event(`$e${i}`, now + (i + 1) * ONE_DAY))
            ),
        ];
        const items = buildEventDirectory(rooms, now, { limit: 3 });
        expect(items).toHaveLength(3);
    });

    it('omits past events when includePast is false', () => {
        const rooms = [
            fakeRoom('!c:s', [
                event('$soon', now + ONE_DAY, 'Soon'),
                event('$past', now - ONE_DAY, 'Past'),
            ]),
        ];
        const items = buildEventDirectory(rooms, now, { includePast: false });
        expect(items.map((item) => item.eventId)).toEqual(['$soon']);
    });
});

describe('splitEventsByTimeline', () => {
    const now = Date.parse('2025-06-01T00:00:00Z');
    it('partitions an ordered list into upcoming and past slots', () => {
        const items = buildEventDirectory(
            [
                fakeRoom('!c:s', [
                    fakeStateEvent({
                        id: '$soon',
                        content: {
                            title: 'A',
                            description: 'a',
                            startsAt: new Date(now + ONE_DAY).toISOString(),
                        },
                    }),
                    fakeStateEvent({
                        id: '$past',
                        content: {
                            title: 'B',
                            description: 'b',
                            startsAt: new Date(now - ONE_DAY).toISOString(),
                        },
                    }),
                ]),
            ],
            now
        );

        const split = splitEventsByTimeline(items, now);
        expect(split.upcoming.map((i) => i.eventId)).toEqual(['$soon']);
        expect(split.past.map((i) => i.eventId)).toEqual(['$past']);
    });
});
