import type { MatrixEvent, Room, RoomMember } from 'matrix-js-sdk';

export type PresenceGroup = 'online' | 'away' | 'offline';

export interface GroupedMembers {
  online: RoomMember[];
  away: RoomMember[];
  offline: RoomMember[];
}

export interface SpaceGroup {
  id: string;
  label: string;
  rooms: Room[];
}

const getMemberPresence = (member: RoomMember): PresenceGroup => {
  const presence = member.events.member?.getContent<Record<string, unknown>>()?.presence;
  if (presence === 'online') return 'online';
  if (presence === 'unavailable') return 'away';
  return 'offline';
};

export const groupMembersByPresence = (members: RoomMember[]): GroupedMembers => {
  return members.reduce<GroupedMembers>(
    (acc, member) => {
      if (member.membership !== 'join') return acc;
      const group = getMemberPresence(member);
      acc[group].push(member);
      return acc;
    },
    { online: [], away: [], offline: [] },
  );
};

export const getTimelineBody = (event: MatrixEvent): string => {
  const content = event.getContent<Record<string, unknown>>();
  return typeof content.body === 'string' ? content.body : '';
};

export const getTimelineRelation = (event: MatrixEvent): Record<string, unknown> | null => {
  const content = event.getContent<Record<string, unknown>>();
  const relation = content['m.relates_to'];
  return typeof relation === 'object' && relation !== null ? (relation as Record<string, unknown>) : null;
};

export const getEventTimestamp = (event: MatrixEvent): string => {
  const ts = event.getTs?.() ?? Date.now();
  return new Date(ts).toLocaleString();
};

export const getThreadEvents = (events: MatrixEvent[]): MatrixEvent[] =>
  events.filter((event) => getTimelineRelation(event)?.rel_type === 'm.thread');

export const getPinnedEvents = (room: Room | null, events: MatrixEvent[]): MatrixEvent[] => {
  if (!room) return [];
  const pinState = room.currentState.getStateEvents('m.room.pinned_events', '');
  const pinned = pinState?.getContent<Record<string, unknown>>()?.pinned;
  if (!Array.isArray(pinned)) return [];

  const pinnedIds = pinned.filter((eventId): eventId is string => typeof eventId === 'string');
  return pinnedIds
    .map((eventId) => events.find((event) => event.getId() === eventId))
    .filter((event): event is MatrixEvent => Boolean(event));
};

export const searchEvents = (events: MatrixEvent[], query: string): MatrixEvent[] => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];
  return events.filter((event) => getTimelineBody(event).toLowerCase().includes(normalizedQuery)).slice(-50).reverse();
};

const getOrderedChildIds = (space: Room): string[] => {
  return space.currentState
    .getStateEvents('m.space.child')
    .map((event) => ({
      roomId: event.getStateKey(),
      order:
        typeof event.getContent<Record<string, unknown>>().order === 'string'
          ? (event.getContent<Record<string, unknown>>().order as string)
          : 'zzz',
    }))
    .filter((entry): entry is { roomId: string; order: string } => Boolean(entry.roomId))
    .sort((a, b) => a.order.localeCompare(b.order))
    .map((entry) => entry.roomId);
};

const collectSpaceGroups = (
  space: Room,
  roomById: Map<string, Room>,
  groups: SpaceGroup[],
  parentPath = '',
  visited = new Set<string>(),
): void => {
  if (visited.has(space.roomId)) return;
  visited.add(space.roomId);

  const orderedChildIds = getOrderedChildIds(space);
  const directRooms = orderedChildIds
    .map((roomId) => roomById.get(roomId))
    .filter((room): room is Room => Boolean(room) && room.getType() !== 'm.space');

  const label = parentPath ? `${parentPath} / ${space.name}` : space.name;
  groups.push({ id: space.roomId, label, rooms: directRooms });

  const childSpaces = orderedChildIds
    .map((roomId) => roomById.get(roomId))
    .filter((room): room is Room => Boolean(room) && room.getType() === 'm.space');

  childSpaces.forEach((childSpace) => collectSpaceGroups(childSpace, roomById, groups, label, new Set(visited)));
};

export const buildSpaceGroups = ({
  selectedSpaceId,
  selectedSpaceRooms,
  rooms,
}: {
  selectedSpaceId: string | null;
  selectedSpaceRooms: Room[];
  rooms: Room[];
}): SpaceGroup[] => {
  if (!selectedSpaceId) {
    return [{ id: 'rooms', label: 'Rooms', rooms: selectedSpaceRooms }];
  }

  const selectedSpace = rooms.find((room) => room.roomId === selectedSpaceId);
  if (!selectedSpace) {
    return [{ id: 'rooms', label: 'Rooms', rooms: selectedSpaceRooms }];
  }

  const childIds = getOrderedChildIds(selectedSpace);
  if (childIds.length === 0) {
    return [{ id: 'rooms', label: 'Rooms', rooms: selectedSpaceRooms }];
  }

  const roomById = new Map(rooms.map((room) => [room.roomId, room]));
  const directRooms = childIds
    .map((roomId) => roomById.get(roomId))
    .filter((room): room is Room => Boolean(room) && room.getType() !== 'm.space');

  const groups: SpaceGroup[] = [{ id: 'general', label: 'General', rooms: directRooms }];
  const childSpaces = childIds
    .map((roomId) => roomById.get(roomId))
    .filter((room): room is Room => Boolean(room) && room.getType() === 'm.space');

  childSpaces.forEach((space) => collectSpaceGroups(space, roomById, groups));
  return groups;
};

export const getUnreadMarkerEventId = (room: Room | null, userId: string | null): string | null => {
  if (!room || !userId) return null;
  return room.getEventReadUpTo(userId, true) ?? null;
};
