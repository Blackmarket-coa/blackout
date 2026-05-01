import { atom } from 'jotai';
import { atomFamily, atomWithStorage, selectAtom } from 'jotai/utils';
import { roomToUnreadAtom as baseRoomToUnreadAtom } from './room/roomToUnread';

export interface RoomUnread {
    total: number;
    highlight: number;
    mentions: number;
}

export type RoomNotificationType = 'mute' | 'mention' | 'all';

export const roomToUnreadAtom = selectAtom(
    baseRoomToUnreadAtom,
    (map): Map<string, RoomUnread> => {
        const projected = new Map<string, RoomUnread>();
        map.forEach((unread, roomId) => {
            projected.set(roomId, {
                total: unread.total,
                highlight: unread.highlight,
                mentions: unread.highlight,
            });
        });
        return projected;
    },
);

const roomNotificationOverridesAtom = atomWithStorage<Record<string, RoomNotificationType>>(
    'blackout.baseline.roomNotificationOverrides.v1',
    {},
);

export const roomNotificationTypeAtom = atomFamily((roomId: string) =>
    atom(
        (get): RoomNotificationType => get(roomNotificationOverridesAtom)[roomId] ?? 'all',
        (get, set, next: RoomNotificationType) => {
            const current = get(roomNotificationOverridesAtom);
            set(roomNotificationOverridesAtom, {
                ...current,
                [roomId]: next,
            });
        },
    ),
);
