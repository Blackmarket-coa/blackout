import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import type { Room } from 'matrix-js-sdk';
import { ReceiptType } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { joinedRoomsAtom } from '../../state/rooms';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import { shouldSendReadReceipts } from '../metadata-privacy/outboundPrivacy';
import {
    selectedRoomIdAtom,
    selectedSpaceIdAtom,
    roomJumpTargetEventIdAtom,
    roomUnreadMarkerEventIdAtom,
} from '../../state/navigation';
import { getUnreadMarkerEventId } from '../right-panel/rightPanelUtils';
import { resolveParentCanopyId } from '../../hooks/roomNavPath';

export interface MentionTarget {
    roomId: string;
    eventId: string;
}

export const useMentionNavigation = () => {
    const client = useMatrixClient();
    const rooms = useAtomValue(joinedRoomsAtom);
    const roomToParents = useAtomValue(roomToParentsAtom);
    const selectedSpaceId = useAtomValue(selectedSpaceIdAtom);
    const setSelectedRoomId = useSetAtom(selectedRoomIdAtom);
    const setSelectedSpaceId = useSetAtom(selectedSpaceIdAtom);
    const setJumpTargetEventId = useSetAtom(roomJumpTargetEventIdAtom);
    const setUnreadMarkerEventId = useSetAtom(roomUnreadMarkerEventIdAtom);

    const openRoomWithContext = useCallback(
        (roomId: string, jumpToEventId?: string) => {
            const room = rooms.find((candidate) => candidate.roomId === roomId) ?? null;
            // Canopy-first: resolve and select the den's parent canopy so the
            // chat shell opens inside the canopy, not as a bare den. Orphan dens
            // / DMs resolve to `null` (the Home / Direct context).
            setSelectedSpaceId(
                resolveParentCanopyId({ mx: client, roomToParents, spaceSelectedId: selectedSpaceId, roomId }),
            );
            setSelectedRoomId(roomId);
            setJumpTargetEventId(jumpToEventId ?? null);
            setUnreadMarkerEventId(getUnreadMarkerEventId(room, client.getUserId()));
        },
        [
            client,
            rooms,
            roomToParents,
            selectedSpaceId,
            setJumpTargetEventId,
            setSelectedRoomId,
            setSelectedSpaceId,
            setUnreadMarkerEventId,
        ],
    );

    const markEventRead = useCallback(
        async (roomId: string, eventId: string) => {
            const room = rooms.find((candidate) => candidate.roomId === roomId);
            const event = room?.findEventById(eventId);
            if (!event) return;

            const receiptClient = client as typeof client & {
                sendReadReceipt?: (event: unknown, receiptType?: ReceiptType) => Promise<unknown>;
            };
            if (receiptClient.sendReadReceipt) {
                // Default (public) call shape preserved; downgrade to a private
                // receipt only when the user opted out of public ones.
                if (shouldSendReadReceipts()) {
                    await receiptClient.sendReadReceipt(event);
                } else {
                    await receiptClient.sendReadReceipt(event, ReceiptType.ReadPrivate);
                }
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

    const getRoomById = useCallback(
        (roomId: string): Room | null => rooms.find((room) => room.roomId === roomId) ?? null,
        [rooms],
    );

    return {
        getRoomById,
        openRoomWithContext,
        openMentionItem,
        markEventRead,
    };
};

export default useMentionNavigation;
