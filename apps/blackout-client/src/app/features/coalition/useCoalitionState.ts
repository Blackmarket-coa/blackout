import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import type { Room } from 'matrix-js-sdk';
import {
    COALITION_STATE_EVENT_TYPE,
    resolveEnabledTabs,
    type CoalitionStateEventContent,
    type CoalitionTabId,
} from '@blackout/core';
import { joinedRoomsAtom } from '../../state/bmc-rooms';

export interface CoalitionStateForRoom {
    enabled: boolean;
    enabledTabs: CoalitionTabId[];
    description?: string;
    canopyId?: string;
}

function readCoalitionContent(room: Room | undefined): CoalitionStateEventContent | undefined {
    if (!room) return undefined;
    const stateEvent = room.currentState
        ?.getStateEvents(COALITION_STATE_EVENT_TYPE, '')
        ?.getContent<CoalitionStateEventContent>();
    return stateEvent && typeof stateEvent === 'object' ? stateEvent : undefined;
}

export function useCoalitionStateForRoom(roomId: string | null): CoalitionStateForRoom {
    const rooms = useAtomValue(joinedRoomsAtom);
    return useMemo(() => {
        if (!roomId) return { enabled: false, enabledTabs: [] };
        const room = rooms.find((candidate) => candidate.roomId === roomId);
        const content = readCoalitionContent(room);
        if (!content || content.enabled === false) {
            return { enabled: false, enabledTabs: [] };
        }
        return {
            enabled: true,
            enabledTabs: resolveEnabledTabs(content),
            description: content.description,
            canopyId: content.canopyId,
        };
    }, [roomId, rooms]);
}
