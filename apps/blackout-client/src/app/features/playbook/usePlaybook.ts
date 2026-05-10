import { useCallback, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import type { Room } from 'matrix-js-sdk';
import {
    DEN_PLAYBOOK_EVENT_TYPE,
    isDenPlaybookPayload,
    type DenPlaybookPayload,
} from '@blackout/protocol';
import { createPlaybookMatrixActions } from '@blackout/sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { joinedRoomsAtom } from '../../state/rooms';

export interface DenPlaybookModel extends DenPlaybookPayload {
    /** Matrix room id this playbook decorates. */
    roomId: string;
}

function readPlaybookContent(room: Room | undefined): DenPlaybookPayload | undefined {
    if (!room) return undefined;
    const stateEvent = room.currentState?.getStateEvents(DEN_PLAYBOOK_EVENT_TYPE, '');
    if (!stateEvent) return undefined;
    const content = stateEvent.getContent<Record<string, unknown>>();
    return isDenPlaybookPayload(content) ? content : undefined;
}

/**
 * Hook: read the playbook attached to a den.
 *
 * Returns `null` for dens that have no playbook event (legacy rooms created
 * before the picker, or rooms left as vanilla Cinny rooms intentionally).
 * Returns the payload merged with the room id when present.
 */
export function useDenPlaybook(roomId: string | null | undefined): DenPlaybookModel | null {
    const rooms = useAtomValue(joinedRoomsAtom);
    return useMemo(() => {
        if (!roomId) return null;
        const room = rooms.find((candidate) => candidate.roomId === roomId);
        const content = readPlaybookContent(room);
        if (!content) return null;
        return { ...content, roomId };
    }, [roomId, rooms]);
}

/**
 * Hook: build a roomId-agnostic playbook writer. Returns a stable callback
 * that takes both `roomId` and the payload. Use this when the roomId isn't
 * known until *after* mount — e.g. the Plant flow's `createRoom → setPlaybook`
 * sequence.
 */
export function useSetAnyPlaybook() {
    const client = useMatrixClient();
    const actions = useMemo(
        () =>
            createPlaybookMatrixActions({
                sendEvent: (rid, et, content) => client.sendEvent(rid, et as never, content as never),
                sendStateEvent: (rid, et, content, stateKey) =>
                    client.sendStateEvent(rid, et as never, content as never, stateKey),
            }),
        [client],
    );

    return useCallback(
        async (roomId: string, payload: DenPlaybookPayload) => {
            await actions.setPlaybook(roomId, payload);
        },
        [actions],
    );
}

/**
 * Hook: write the playbook to a den whose id is already known. Returns a
 * stable callback that performs the state-event write through the SDK's
 * matrix actions. Use this from the settings surface for later edits.
 */
export function useSetPlaybook(roomId: string | null | undefined) {
    const setAny = useSetAnyPlaybook();

    return useCallback(
        async (payload: DenPlaybookPayload) => {
            if (!roomId) throw new Error('useSetPlaybook: roomId is required');
            await setAny(roomId, payload);
        },
        [setAny, roomId],
    );
}
