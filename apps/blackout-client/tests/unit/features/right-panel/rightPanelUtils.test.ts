import { describe, expect, it } from 'vitest';
import type { MatrixEvent, Room, RoomMember } from 'matrix-js-sdk';
import {
    buildSpaceGroups,
    findThreadRoot,
    getMentionInboxItems,
    getPinnedEvents,
    getThreadEvents,
    getThreadRootEventId,
    getThreadRootIds,
    getUnreadMarkerEventId,
    groupMembersByPresence,
    groupThreadReplies,
    searchEvents,
} from '../../../../src/app/features/right-panel/rightPanelUtils';

const mockMember = (presence?: string): RoomMember =>
    ({
        membership: 'join',
        userId: `@${presence ?? 'offline'}:example.org`,
        events: {
            member: {
                getContent: () => (presence ? { presence } : {}),
            },
        },
    }) as unknown as RoomMember;

const mockEvent = ({
    id,
    body,
    relType,
    mentions,
    ts = 1_700_000_000_000,
}: {
    id: string;
    body?: string;
    relType?: string;
    mentions?: { user_ids?: string[]; room?: boolean };
    ts?: number;
}): MatrixEvent =>
    ({
        getId: () => id,
        getTs: () => ts,
        getType: () => 'm.room.message',
        getContent: () => ({
            ...(body ? { body } : {}),
            ...(relType ? { 'm.relates_to': { rel_type: relType } } : {}),
            ...(mentions ? { 'm.mentions': mentions } : {}),
        }),
    }) as unknown as MatrixEvent;

const mockRoom = ({
    roomId,
    name,
    type,
    children = [],
    pinned = [],
    readUpTo,
}: {
    roomId: string;
    name: string;
    type?: string;
    children?: Array<{ roomId: string; order?: string }>;
    pinned?: string[];
    readUpTo?: string | null;
}): Room =>
    ({
        roomId,
        name,
        getType: () => type,
        getEventReadUpTo: () => readUpTo,
        getLiveTimeline: () => ({
            getEvents: () => [],
        }),
        currentState: {
            getStateEvents: (eventType: string) => {
                if (eventType === 'm.space.child') {
                    return children.map((child) => ({
                        getStateKey: () => child.roomId,
                        getContent: () => ({ order: child.order }),
                    }));
                }

                if (eventType === 'm.room.pinned_events') {
                    return {
                        getContent: () => ({ pinned }),
                    };
                }

                return [];
            },
        },
    }) as unknown as Room;

describe('rightPanelUtils', () => {
    it('groups members by typed presence from member event content', () => {
        const grouped = groupMembersByPresence([
            mockMember('online'),
            mockMember('unavailable'),
            mockMember(),
        ]);

        expect(grouped.online).toHaveLength(1);
        expect(grouped.away).toHaveLength(1);
        expect(grouped.offline).toHaveLength(1);
    });

    it('finds thread events and search results', () => {
        const events = [
            mockEvent({ id: 'evt-thread', body: 'thread body', relType: 'm.thread' }),
            mockEvent({ id: 'evt-normal', body: 'hello world' }),
        ];

        expect(getThreadEvents(events).map((event) => event.getId())).toEqual(['evt-thread']);
        expect(searchEvents(events, 'hello').map((event) => event.getId())).toEqual(['evt-normal']);
    });

    it('resolves pinned events from room state', () => {
        const events = [
            mockEvent({ id: 'evt-1', body: 'one' }),
            mockEvent({ id: 'evt-2', body: 'two' }),
        ];
        const room = mockRoom({ roomId: '!r:example.org', name: 'Room', pinned: ['evt-2'] });

        expect(getPinnedEvents(room, events).map((event) => event.getId())).toEqual(['evt-2']);
    });

    it('builds hierarchy groups with fallback and nested spaces', () => {
        const nestedSpace = mockRoom({
            roomId: '!space-child:example.org',
            name: 'Sub',
            type: 'm.space',
            children: [{ roomId: '!room-nested:example.org' }],
        });
        const selectedSpace = mockRoom({
            roomId: '!space-root:example.org',
            name: 'Root',
            type: 'm.space',
            children: [
                { roomId: '!room-general:example.org', order: 'a' },
                { roomId: '!space-child:example.org', order: 'b' },
            ],
        });
        const generalRoom = mockRoom({ roomId: '!room-general:example.org', name: 'general' });
        const nestedRoom = mockRoom({ roomId: '!room-nested:example.org', name: 'nested' });

        const groups = buildSpaceGroups({
            selectedSpaceId: '!space-root:example.org',
            selectedSpaceRooms: [generalRoom, nestedRoom],
            rooms: [selectedSpace, nestedSpace, generalRoom, nestedRoom],
        });

        expect(groups[0].label).toBe('General');
        expect(groups[0].rooms.map((room) => room.roomId)).toEqual(['!room-general:example.org']);
        expect(groups[1].label).toBe('Sub');
        expect(groups[1].rooms.map((room) => room.roomId)).toEqual(['!room-nested:example.org']);
    });

    it('uses read receipt marker when deriving unread anchor', () => {
        const room = mockRoom({ roomId: '!room:example.org', name: 'room', readUpTo: '$event' });

        expect(getUnreadMarkerEventId(room, '@me:example.org')).toBe('$event');
        expect(getUnreadMarkerEventId(room, null)).toBeNull();
    });

    it('builds mention inbox from structured mention signals and dedupes by event/time window', () => {
        const mentionA = mockEvent({
            id: '$mention-a',
            body: 'hello there',
            mentions: { user_ids: ['@me:example.org'] },
            ts: 1_700_000_100_000,
        });
        const mentionDuplicate = mockEvent({
            id: '$mention-dup',
            body: 'hello there',
            mentions: { user_ids: ['@me:example.org'] },
            ts: 1_700_000_120_000,
        });
        const mentionAll = mockEvent({
            id: '$mention-all',
            body: 'attention everyone',
            mentions: { room: true },
            ts: 1_700_000_180_000,
        });
        const room = {
            ...mockRoom({
                roomId: '!mentions:example.org',
                name: 'Mentions',
                readUpTo: '$mention-a',
            }),
            getLiveTimeline: () => ({
                getEvents: () => [mentionA, mentionDuplicate, mentionAll],
            }),
        } as unknown as Room;

        const items = getMentionInboxItems({
            rooms: [room],
            userId: '@me:example.org',
            dedupeWindowMs: 60_000,
        });

        expect(items).toHaveLength(2);
        expect(items[0]?.eventId).toBe('$mention-all');
        expect(items[0]?.unread).toBe(true);
        expect(items[1]?.eventId).toBe('$mention-a');
        expect(items[1]?.unread).toBe(false);
    });
});

const threadEvent = ({
    id,
    rootEventId,
    body = '',
}: {
    id: string;
    rootEventId?: string;
    body?: string;
}): MatrixEvent =>
    ({
        getId: () => id,
        getTs: () => 0,
        getType: () => 'm.room.message',
        getContent: () =>
            rootEventId
                ? {
                      body,
                      'm.relates_to': { rel_type: 'm.thread', event_id: rootEventId },
                  }
                : { body },
    }) as unknown as MatrixEvent;

describe('rightPanelUtils — thread-tree helpers (Workstream C)', () => {
    describe('getThreadRootEventId', () => {
        it('returns the relation event_id for a thread reply', () => {
            const reply = threadEvent({ id: '$reply', rootEventId: '$root' });
            expect(getThreadRootEventId(reply)).toBe('$root');
        });

        it('returns null for events with no relation', () => {
            const event = threadEvent({ id: '$plain' });
            expect(getThreadRootEventId(event)).toBeNull();
        });

        it('returns null for non-thread relations (m.replace, m.annotation, etc.)', () => {
            const annotation = {
                getId: () => '$annotation',
                getTs: () => 0,
                getType: () => 'm.reaction',
                getContent: () => ({
                    'm.relates_to': {
                        rel_type: 'm.annotation',
                        event_id: '$target',
                        key: '👍',
                    },
                }),
            } as unknown as MatrixEvent;
            expect(getThreadRootEventId(annotation)).toBeNull();
        });

        it('returns null when event_id is missing or non-string', () => {
            const noEventId = {
                getId: () => '$bad',
                getTs: () => 0,
                getType: () => 'm.room.message',
                getContent: () => ({
                    'm.relates_to': { rel_type: 'm.thread' },
                }),
            } as unknown as MatrixEvent;
            const numericEventId = {
                getId: () => '$bad2',
                getTs: () => 0,
                getType: () => 'm.room.message',
                getContent: () => ({
                    'm.relates_to': { rel_type: 'm.thread', event_id: 42 },
                }),
            } as unknown as MatrixEvent;
            expect(getThreadRootEventId(noEventId)).toBeNull();
            expect(getThreadRootEventId(numericEventId)).toBeNull();
        });
    });

    describe('getThreadRootIds', () => {
        it('returns the unique set of root ids in first-occurrence order', () => {
            const events = [
                threadEvent({ id: '$r1', rootEventId: '$rootA' }),
                threadEvent({ id: '$r2', rootEventId: '$rootB' }),
                threadEvent({ id: '$r3', rootEventId: '$rootA' }),
                threadEvent({ id: '$plain' }),
                threadEvent({ id: '$r4', rootEventId: '$rootC' }),
            ];
            expect(getThreadRootIds(events)).toEqual(['$rootA', '$rootB', '$rootC']);
        });

        it('returns an empty array when no thread replies are present', () => {
            const events = [threadEvent({ id: '$a' }), threadEvent({ id: '$b' })];
            expect(getThreadRootIds(events)).toEqual([]);
        });
    });

    describe('groupThreadReplies', () => {
        it('groups replies by root event id, preserving input order', () => {
            const events = [
                threadEvent({ id: '$r1', rootEventId: '$rootA', body: 'A1' }),
                threadEvent({ id: '$r2', rootEventId: '$rootB', body: 'B1' }),
                threadEvent({ id: '$r3', rootEventId: '$rootA', body: 'A2' }),
                threadEvent({ id: '$plain' }),
            ];

            const groups = groupThreadReplies(events);
            expect(groups.size).toBe(2);
            expect(groups.get('$rootA')?.map((e) => e.getId())).toEqual(['$r1', '$r3']);
            expect(groups.get('$rootB')?.map((e) => e.getId())).toEqual(['$r2']);
        });

        it('drops non-thread events silently', () => {
            const events = [
                threadEvent({ id: '$plain1' }),
                threadEvent({ id: '$plain2' }),
            ];
            expect(groupThreadReplies(events).size).toBe(0);
        });

        it('returns an empty map for an empty input', () => {
            expect(groupThreadReplies([]).size).toBe(0);
        });
    });

    describe('findThreadRoot', () => {
        it('returns the matching event when present in the window', () => {
            const root = threadEvent({ id: '$rootA', body: 'root message' });
            const events = [
                threadEvent({ id: '$r1', rootEventId: '$rootA' }),
                root,
                threadEvent({ id: '$r2', rootEventId: '$rootA' }),
            ];
            expect(findThreadRoot(events, '$rootA')).toBe(root);
        });

        it('returns null when the root is not in the window (panel hasn\'t loaded it yet)', () => {
            const events = [threadEvent({ id: '$r1', rootEventId: '$missing' })];
            expect(findThreadRoot(events, '$missing')).toBeNull();
        });

        it('returns null for an empty rootEventId', () => {
            const events = [threadEvent({ id: '$rootA' })];
            expect(findThreadRoot(events, '')).toBeNull();
        });
    });
});
