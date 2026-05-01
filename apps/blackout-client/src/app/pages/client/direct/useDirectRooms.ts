import { useAtomValue } from 'jotai';
import { selectAtom } from 'jotai/utils';
import { useCallback } from 'react';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { isRoom } from '../../../utils/room';
import { compareRoomsEqual } from '../../../state/room-list/utils';
import { allRoomsAtom } from '../../../state/room-list/roomList';
import { mDirectAtom } from '../../../state/mDirectList';

export const useDirectRooms = (): string[] => {
    const mx = useMatrixClient();
    const mDirects = useAtomValue(mDirectAtom);
    const selector = useCallback(
        (rooms: string[]) =>
            rooms.filter((roomId) => mDirects.has(roomId) && isRoom(mx.getRoom(roomId))),
        [mx, mDirects],
    );
    return useAtomValue(selectAtom(allRoomsAtom, selector, compareRoomsEqual));
};
