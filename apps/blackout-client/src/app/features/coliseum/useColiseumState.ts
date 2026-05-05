import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import type { Room } from 'matrix-js-sdk';
import {
    COLISEUM_STATE_EVENT_TYPE,
    resolveEnabledColiseumTabs,
    type ColiseumStateEventContent,
    type ColiseumTabId,
} from '@blackout/core';
import { joinedRoomsAtom } from '../../state/rooms';

export interface ColiseumStateForRoom {
    enabled: boolean;
    enabledTabs: ColiseumTabId[];
    description?: string;
    canopyId?: string;
}

function readColiseumContent(room: Room | undefined): ColiseumStateEventContent | undefined {
    if (!room) return undefined;
    const stateEvent = room.currentState
        ?.getStateEvents(COLISEUM_STATE_EVENT_TYPE, '')
        ?.getContent<ColiseumStateEventContent>();
    return stateEvent && typeof stateEvent === 'object' ? stateEvent : undefined;
}

export function useColiseumStateForRoom(roomId: string | null): ColiseumStateForRoom {
    const rooms = useAtomValue(joinedRoomsAtom);
    return useMemo(() => {
        if (!roomId) return { enabled: false, enabledTabs: [] };
        const room = rooms.find((candidate) => candidate.roomId === roomId);
        const content = readColiseumContent(room);
        if (!content || content.enabled === false) {
            return { enabled: false, enabledTabs: [] };
        }
        return {
            enabled: true,
            enabledTabs: resolveEnabledColiseumTabs(content),
            description: content.description,
            canopyId: content.canopyId,
        };
    }, [roomId, rooms]);
}
