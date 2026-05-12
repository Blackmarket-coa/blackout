import { useCallback, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import type { Room } from 'matrix-js-sdk';
import {
    COMPOST_EVENT_TYPE,
    isCompostPayload,
    type CompostPayload,
} from '@blackout/protocol';
import { createCompostMatrixActions } from '@blackout/sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { joinedRoomsAtom } from '../../state/rooms';
import { useDenPlaybook } from '../playbook/usePlaybook';

/**
 * Hook: read the compost marker for a den. Returns `null` when the den is
 * still in service. Used by the sidebar to render composted dens
 * desaturated (phenology phase = compost) and by the room header to flag
 * lineage to anyone re-joining for archival reading.
 */
export function useCompost(roomId: string | null | undefined): CompostPayload | null {
    const rooms = useAtomValue(joinedRoomsAtom);
    return useMemo(() => {
        if (!roomId) return null;
        const room: Room | undefined = rooms.find((r) => r.roomId === roomId);
        if (!room) return null;
        const event = room.currentState?.getStateEvents(COMPOST_EVENT_TYPE, '');
        if (!event) return null;
        const content = event.getContent<Record<string, unknown>>();
        return isCompostPayload(content) ? content : null;
    }, [roomId, rooms]);
}

/**
 * Predicate: is the Compost affordance available in this room?
 *
 * Only governance-active playbooks see Compost. Casual dens (Hearth, or
 * unconfigured rooms) keep the existing Leave path so we don't slow down
 * the simple use case.
 */
export function useCompostAvailable(roomId: string | null | undefined): boolean {
    const playbook = useDenPlaybook(roomId);
    return !!playbook?.features.governanceActive;
}

export interface CompostInput {
    /** Free-form note — the brief frames this as "what we learned". */
    reason?: string;
}

/**
 * Hook: compost this den. Writes the `co.bmc.den.compost` state event then
 * leaves the room. The lineage marker stays so a parent canopy can render
 * the composted child even after the user is no longer a member.
 */
export function useCompostDen(roomId: string | null | undefined, initiator: string | null) {
    const client = useMatrixClient();
    const actions = useMemo(
        () =>
            createCompostMatrixActions({
                sendEvent: (rid, et, content) =>
                    client.sendEvent(rid, et as never, content as never),
                sendStateEvent: (rid, et, content, stateKey) =>
                    client.sendStateEvent(rid, et as never, content as never, stateKey),
            }),
        [client],
    );

    return useCallback(
        async ({ reason }: CompostInput = {}) => {
            if (!roomId) throw new Error('useCompostDen: roomId is required');
            if (!initiator) throw new Error('useCompostDen: initiator is required');
            const occurredAt = new Date().toISOString();
            await actions.compost(roomId, {
                initiator,
                reason: reason?.trim() ? reason.trim() : undefined,
                occurredAt,
                updatedAt: occurredAt,
            });
            // The lineage marker lives on; leaving is a separate, optional step
            // so callers can decide whether to stay around for the archive.
            await client.leave(roomId);
        },
        [actions, client, initiator, roomId],
    );
}
