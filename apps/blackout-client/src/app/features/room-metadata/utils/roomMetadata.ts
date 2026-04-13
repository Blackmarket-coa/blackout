import type { MatrixClient, Room, RoomMember } from 'matrix-js-sdk';

export type RoomTypeLabel = 'space' | 'text' | 'voice' | 'forum' | 'announcement';

export const getRoomName = (room: Room): string => room.name || room.roomId;

export const getRoomAvatar = (room: Room, mx: MatrixClient): string | null => {
    const avatarMxc = room.getAvatarUrl(mx.getHomeserverUrl(), 96, 96, 'crop', false, false);
    return avatarMxc ?? null;
};

export const getRoomTopic = (room: Room): string | null =>
    room.currentState.getStateEvents('m.room.topic', '')?.getContent().topic ?? null;

export const isSpace = (room: Room): boolean => room.getType() === 'm.space';

export const isDM = (room: Room): boolean => room.getJoinedMembers().length === 2 && !isSpace(room);

export const getRoomType = (room: Room): RoomTypeLabel => {
    if (isSpace(room)) return 'space';

    const createType = room.getType();
    if (createType === 'org.matrix.msc3417.call') return 'voice';
    if (createType === 'io.element.thread') return 'forum';

    const joinRule = room.currentState
        .getStateEvents('m.room.join_rules', '')
        ?.getContent().join_rule;
    if (joinRule === 'knock' || joinRule === 'restricted') return 'announcement';

    return 'text';
};

export const getJoinedMembers = (room: Room): RoomMember[] => room.getJoinedMembers();

export const getPowerLevel = (room: Room, userId: string): number => {
    const powerContent =
        room.currentState
            .getStateEvents('m.room.power_levels', '')
            ?.getContent<Record<string, unknown>>() ?? {};
    const users = (powerContent.users as Record<string, number> | undefined) ?? {};
    const usersDefault = (powerContent.users_default as number | undefined) ?? 0;
    return users[userId] ?? usersDefault;
};

export const canDoAction = (room: Room, userId: string, action: string): boolean => {
    const powerContent =
        room.currentState
            .getStateEvents('m.room.power_levels', '')
            ?.getContent<Record<string, unknown>>() ?? {};
    const eventLevels = (powerContent.events as Record<string, number> | undefined) ?? {};
    const eventsDefault = (powerContent.events_default as number | undefined) ?? 0;
    const requiredLevel = eventLevels[action] ?? eventsDefault;
    return getPowerLevel(room, userId) >= requiredLevel;
};
