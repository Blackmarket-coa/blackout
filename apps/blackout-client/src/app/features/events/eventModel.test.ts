import { describe, expect, it } from 'vitest';
import {
    buildEventDirectory,
    buildMonthGrid,
    collectEventsFromRoom,
    splitEventsByTimeline,
    type EventStateLike,
    type EventViewItem,
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

describe('buildMonthGrid', () => {
    const eventAt = (id: string, iso: string): EventViewItem => ({
        id,
        roomId: '!r:s',
        eventId: id,
        title: id,
        description: '',
        startsAt: iso,
        visibility: 'public',
        tags: [],
        updatedAt: iso,
        startsAtMs: Date.parse(iso),
    });

    it('lays out a Sunday-first 6x7 grid and buckets events by UTC day', () => {
        const grid = buildMonthGrid(
            [eventAt('$a', '2026-05-15T12:00:00Z'), eventAt('$b', '2026-05-15T18:00:00Z')],
            2026,
            4 // May (0-based)
        );
        expect(grid.weeks).toHaveLength(6);
        for (const week of grid.weeks) expect(week).toHaveLength(7);

        const cells = grid.weeks.flat();
        const may15 = cells.find((cell) => cell.date === '2026-05-15');
        expect(may15?.inMonth).toBe(true);
        expect(may15?.events.map((e) => e.eventId)).toEqual(['$a', '$b']);

        // A day with no events stays empty, and spill-over days are flagged.
        const may16 = cells.find((cell) => cell.date === '2026-05-16');
        expect(may16?.events).toEqual([]);
        expect(cells.some((cell) => !cell.inMonth)).toBe(true);
    });
});
