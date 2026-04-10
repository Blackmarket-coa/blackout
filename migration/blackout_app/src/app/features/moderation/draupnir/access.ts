import type { Room } from 'matrix-js-sdk';

const MODERATOR_POWER_LEVEL = 50;

export const hasModeratorAccess = (rooms: Room[], userId: string | null): boolean => {
    if (!userId) return false;

    return rooms.some((room) => {
        if (room.getMyMembership() !== 'join') return false;

        const powerEvent = room.currentState.getStateEvents('m.room.power_levels', '');
        if (!powerEvent || Array.isArray(powerEvent) || typeof powerEvent.getContent !== 'function')
            return false;

        const powerContent = powerEvent.getContent<Record<string, unknown>>();
        const users = (powerContent.users as Record<string, number> | undefined) ?? {};
        const usersDefault = (powerContent.users_default as number | undefined) ?? 0;
        const level = users[userId] ?? usersDefault;

        return level >= MODERATOR_POWER_LEVEL;
    });
};
