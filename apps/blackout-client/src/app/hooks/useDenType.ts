import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import type { Room } from 'matrix-js-sdk';
import {
    DEN_CLASSIFICATION_STATE_EVENT_TYPE,
    resolveDenType,
    type DenClassificationContent,
    type DenType,
} from '@blackout/core';
import { joinedRoomsAtom } from '../state/rooms';

function readClassification(room: Room | undefined): DenClassificationContent | undefined {
    if (!room) return undefined;
    const content = room.currentState
        ?.getStateEvents(DEN_CLASSIFICATION_STATE_EVENT_TYPE, '')
        ?.getContent<DenClassificationContent>();
    return content && typeof content === 'object' ? content : undefined;
}

/** Resolve a den's classification type from its Matrix room state. */
export function useDenType(roomId: string | null): DenType {
    const rooms = useAtomValue(joinedRoomsAtom);
    return useMemo(() => {
        if (!roomId) return resolveDenType(undefined);
        const room = rooms.find((candidate) => candidate.roomId === roomId);
        return resolveDenType(readClassification(room));
    }, [roomId, rooms]);
}
