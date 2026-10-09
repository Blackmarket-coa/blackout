import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { joinedRoomsAtom } from '../../state/rooms';
import { mDirectAtom } from '../../state/mDirectList';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import { roomToEmbedFacts, type EmbedRoomFacts } from './embedScope';

/**
 * The joined rooms, reduced to the facts the panel's scoping rule reads.
 * Recomputes when the room list, `m.direct` or the space-parent map change
 * (all three are bound to Matrix sync by `EmbedAtomBinders`).
 */
export const useEmbedRoomFacts = (): EmbedRoomFacts[] => {
    const rooms = useAtomValue(joinedRoomsAtom);
    const directRoomIds = useAtomValue(mDirectAtom);
    const roomToParents = useAtomValue(roomToParentsAtom);
    return useMemo(
        () =>
            rooms.map((room) =>
                roomToEmbedFacts(room, directRoomIds, roomToParents.get(room.roomId))
            ),
        [rooms, directRoomIds, roomToParents]
    );
};
