import type { MatrixClient, Room, RoomMember } from 'matrix-js-sdk';

export type RoomTypeLabel = 'space' | 'text' | 'voice' | 'forum' | 'announcement';

/** Resolve room display name with safe fallback to room ID. */
export const getRoomName = (room: Room): string => room.name || room.roomId;

/** Resolve room avatar MXC URI to HTTP URL using active Matrix client URL resolver. */
export const getRoomAvatar = (room: Room, mx: MatrixClient): string | null => {
  const avatarMxc = room.getAvatarUrl(mx.getHomeserverUrl(), 96, 96, 'crop', false, false);
  return avatarMxc ?? null;
};

/** Resolve room topic from current state. */
export const getRoomTopic = (room: Room): string | null => room.currentState.getStateEvents('m.room.topic', '')?.getContent().topic ?? null;

/** True when room is Matrix space (`m.space`). */
export const isSpace = (room: Room): boolean => room.getType() === 'm.space';

/** Best-effort direct-message detection (joined rooms with exactly two joined members). */
export const isDM = (room: Room): boolean => room.getJoinedMembers().length === 2 && !isSpace(room);

/** Derive lightweight room type label for UI grouping. */
export const getRoomType = (room: Room): RoomTypeLabel => {
  if (isSpace(room)) return 'space';

  const createType = room.getType();
  if (createType === 'org.matrix.msc3417.call') return 'voice';
  if (createType === 'io.element.thread') return 'forum';

  const joinRule = room.currentState.getStateEvents('m.room.join_rules', '')?.getContent().join_rule;
  if (joinRule === 'knock' || joinRule === 'restricted') return 'announcement';

  return 'text';
};

/** List members whose membership is currently `join`. */
export const getJoinedMembers = (room: Room): RoomMember[] => room.getJoinedMembers();

/** Resolve effective power level for a user in the room. */
export const getPowerLevel = (room: Room, userId: string): number => {
  const powerContent = room.currentState.getStateEvents('m.room.power_levels', '')?.getContent<Record<string, unknown>>() ?? {};
  const users = (powerContent.users as Record<string, number> | undefined) ?? {};
  const usersDefault = (powerContent.users_default as number | undefined) ?? 0;
  return users[userId] ?? usersDefault;
};

/** Check if user can perform a Matrix action based on room power levels. */
export const canDoAction = (room: Room, userId: string, action: string): boolean => {
  const powerContent = room.currentState.getStateEvents('m.room.power_levels', '')?.getContent<Record<string, unknown>>() ?? {};
  const eventLevels = (powerContent.events as Record<string, number> | undefined) ?? {};
  const eventsDefault = (powerContent.events_default as number | undefined) ?? 0;
  const requiredLevel = eventLevels[action] ?? eventsDefault;
  return getPowerLevel(room, userId) >= requiredLevel;
};
