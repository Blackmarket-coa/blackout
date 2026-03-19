import { atom } from 'jotai';
import { atomFamily, atomWithStorage, selectAtom } from 'jotai/utils';
import type { NotificationCountType } from 'matrix-js-sdk';
import { joinedRoomsAtom } from './rooms';

export interface RoomUnread {
  total: number;
  highlight: number;
  mentions: number;
}

export type RoomNotificationType = 'mute' | 'mention' | 'all';

/**
 * Persisted per-room notification override settings.
 */
const roomNotificationOverridesAtom = atomWithStorage<Record<string, RoomNotificationType>>(
  'blackout.roomNotificationOverrides.v1',
  {},
);

/**
 * Per-room unread counters keyed by room ID.
 */
const roomToUnreadBaseAtom = atom<Map<string, RoomUnread>>((get) => {
  const joinedRooms = get(joinedRoomsAtom);

  return joinedRooms.reduce<Map<string, RoomUnread>>((acc, room) => {
    const total = room.getUnreadNotificationCount('total' as NotificationCountType) ?? 0;
    const highlight = room.getUnreadNotificationCount('highlight' as NotificationCountType) ?? 0;
    const mentions = highlight;

    acc.set(room.roomId, { total, highlight, mentions });
    return acc;
  }, new Map<string, RoomUnread>());
});

/**
 * Public selector exposing unread counts map by room ID.
 */
export const roomToUnreadAtom = selectAtom(roomToUnreadBaseAtom, (value) => value);

/**
 * Aggregate unread total across joined rooms.
 */
export const totalUnreadAtom = selectAtom(roomToUnreadAtom, (roomToUnread) => {
  let total = 0;
  roomToUnread.forEach((stats) => {
    total += stats.total;
  });
  return total;
});

/**
 * Atom family exposing notification behavior per room (mute/mention/all).
 */
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
