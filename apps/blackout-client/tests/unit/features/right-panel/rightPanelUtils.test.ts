import { describe, expect, it } from 'vitest';
import type { MatrixEvent, Room, RoomMember } from 'matrix-js-sdk';
import {
  buildSpaceGroups,
  getPinnedEvents,
  getThreadEvents,
  getUnreadMarkerEventId,
  groupMembersByPresence,
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
}: {
  id: string;
  body?: string;
  relType?: string;
}): MatrixEvent =>
  ({
    getId: () => id,
    getTs: () => 1_700_000_000_000,
    getContent: () => ({
      ...(body ? { body } : {}),
      ...(relType ? { 'm.relates_to': { rel_type: relType } } : {}),
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
    const grouped = groupMembersByPresence([mockMember('online'), mockMember('unavailable'), mockMember()]);

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
    const events = [mockEvent({ id: 'evt-1', body: 'one' }), mockEvent({ id: 'evt-2', body: 'two' })];
    const room = mockRoom({ roomId: '!r:example.org', name: 'Room', pinned: ['evt-2'] });

    expect(getPinnedEvents(room, events).map((event) => event.getId())).toEqual(['evt-2']);
  });

  it('builds hierarchy groups with fallback and nested spaces', () => {
    const nestedSpace = mockRoom({ roomId: '!space-child:example.org', name: 'Sub', type: 'm.space', children: [{ roomId: '!room-nested:example.org' }] });
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
});
