import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import type { Room } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { joinedRoomsAtom } from '../../state/rooms';
import { selectedRoomIdAtom, roomJumpTargetEventIdAtom, roomUnreadMarkerEventIdAtom } from '../../state/navigation';
import { getUnreadMarkerEventId } from '../right-panel/rightPanelUtils';

export interface MentionTarget {
  roomId: string;
  eventId: string;
}

export const useMentionNavigation = () => {
  const client = useMatrixClient();
  const rooms = useAtomValue(joinedRoomsAtom);
  const setSelectedRoomId = useSetAtom(selectedRoomIdAtom);
  const setJumpTargetEventId = useSetAtom(roomJumpTargetEventIdAtom);
  const setUnreadMarkerEventId = useSetAtom(roomUnreadMarkerEventIdAtom);

  const openRoomWithContext = useCallback(
    (roomId: string, jumpToEventId?: string) => {
      const room = rooms.find((candidate) => candidate.roomId === roomId) ?? null;
      setSelectedRoomId(roomId);
      setJumpTargetEventId(jumpToEventId ?? null);
      setUnreadMarkerEventId(getUnreadMarkerEventId(room, client.getUserId()));
    },
    [client, rooms, setJumpTargetEventId, setSelectedRoomId, setUnreadMarkerEventId],
  );

  const markEventRead = useCallback(
    async (roomId: string, eventId: string) => {
      const room = rooms.find((candidate) => candidate.roomId === roomId);
      const event = room?.findEventById(eventId);
      if (!event) return;

      const receiptClient = client as typeof client & {
        sendReadReceipt?: (event: unknown) => Promise<unknown>;
      };
      if (receiptClient.sendReadReceipt) {
        await receiptClient.sendReadReceipt(event);
      }
    },
    [client, rooms],
  );

  const openMentionItem = useCallback(
    async (item: MentionTarget) => {
      openRoomWithContext(item.roomId, item.eventId);
      await markEventRead(item.roomId, item.eventId);
    },
    [markEventRead, openRoomWithContext],
  );

  const getRoomById = useCallback((roomId: string): Room | null => rooms.find((room) => room.roomId === roomId) ?? null, [rooms]);

  return {
    getRoomById,
    openRoomWithContext,
    openMentionItem,
    markEventRead,
  };
};

export default useMentionNavigation;
