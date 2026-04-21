import { useAtomValue } from 'jotai';
import { useMatrixClient } from './useMatrixClient';
import { mDirectAtom } from '../state/mDirectList';
import { allRoomsAtom } from '../state/room-list/roomList';
import { useDirects } from '../state/hooks/roomList';

export const useDirectRooms = () => {
    const client = useMatrixClient();
    const directMap = useAtomValue(mDirectAtom);
    return useDirects(client, allRoomsAtom, directMap);
};
