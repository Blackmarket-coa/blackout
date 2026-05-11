import { useCallback, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import type { Room } from 'matrix-js-sdk';
import {
    ROLE_EVENT_TYPE,
    isRolePayload,
    type RolePayload,
} from '@blackout/protocol';
import { createRolesMatrixActions } from '@blackout/sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { joinedRoomsAtom } from '../../state/rooms';
import { userIdAtom } from '../../state/auth';
import { useCompleteQuest } from '../quests/useQuests';

/**
 * Term-bound, electable sociocratic roles. Distinct from the power-level-
 * shaped roles defined in `features/roles/` (those carry permissions; these
 * carry a domain and a term window). Election rides on consent proposals
 * (work-stream D); when a consent proposal passes, the proposer updates the
 * role state event with the elected holder and a fresh term.
 */
export interface GovernanceRoleModel extends RolePayload {
    /** Matrix event id of the state event carrying this role. */
    eventId: string;
}

function readRolePayloads(room: Room | undefined): GovernanceRoleModel[] {
    if (!room) return [];
    const eventsRaw = room.currentState?.getStateEvents(ROLE_EVENT_TYPE);
    const events = Array.isArray(eventsRaw) ? eventsRaw : eventsRaw ? [eventsRaw] : [];
    const result: GovernanceRoleModel[] = [];
    for (const event of events) {
        const content = event.getContent<Record<string, unknown>>();
        if (!isRolePayload(content)) continue;
        result.push({
            ...content,
            eventId: event.getId() ?? `${event.getTs()}-${content.roleId}`,
        });
    }
    return result;
}

/**
 * Hook: read every governance role state event attached to a den, sorted by
 * name. Vacant roles (empty `holderId`) are still returned — the UI surfaces
 * them with a "Vacant" state and the "Open election" CTA.
 */
export const useGovernanceRoles = (roomId: string | null | undefined): GovernanceRoleModel[] => {
    const rooms = useAtomValue(joinedRoomsAtom);
    return useMemo(() => {
        if (!roomId) return [];
        const room = rooms.find((candidate) => candidate.roomId === roomId);
        const roles = readRolePayloads(room);
        roles.sort((a, b) => a.name.localeCompare(b.name));
        return roles;
    }, [roomId, rooms]);
};

/**
 * Hook: write a role state event. Used by the election flow when a consent
 * proposal passes — the proposer (or facilitator) updates the role with the
 * elected member's user id and a fresh term window.
 */
export const useSetGovernanceRole = (roomId: string | null | undefined) => {
    const client = useMatrixClient();
    const myUserId = useAtomValue(userIdAtom);
    const completeQuest = useCompleteQuest();
    const actions = useMemo(
        () =>
            createRolesMatrixActions({
                sendEvent: (rid, et, content) =>
                    client.sendEvent(rid, et as never, content as never),
                sendStateEvent: (rid, et, content, stateKey) =>
                    client.sendStateEvent(rid, et as never, content as never, stateKey),
            }),
        [client],
    );

    return useCallback(
        async (payload: RolePayload) => {
            if (!roomId) throw new Error('useSetGovernanceRole: roomId is required');
            await actions.setRole(roomId, payload);
            // J3 auto-completion: getting nominated into a role (someone
            // writes payload.holderId === me) ticks the first-role-nomination
            // quest. We can't observe nominations on someone else's writes,
            // so we tick the quest whenever the local user wrote a role
            // that elevates them.
            if (myUserId && payload.holderId === myUserId) {
                void completeQuest('first-role-nomination', roomId);
            }
        },
        [actions, completeQuest, myUserId, roomId],
    );
};
