import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import {
    ROLE_EVENT_TYPE,
    DEN_PLAYBOOK_EVENT_TYPE,
    isDenPlaybookPayload,
    isRolePayload,
    type DenPlaybookPayload,
    type RolePayload,
} from '@blackout/protocol';
import {
    aggregateCharacterSheet,
    type CharacterSheetEntry,
    type CharacterSheetRoomInput,
} from '../../../lib/bmc-core/characterSheet';
import { userIdAtom } from '../../state/auth';
import { joinedRoomsAtom } from '../../state/rooms';
import { useUserQuests } from '../quests/useQuests';

/**
 * Hook: derive the user's character sheet from their joined rooms + their
 * completed quest log. Reads room state synchronously (Matrix has it
 * available the moment the room is joined) so the sheet renders without
 * extra round-trips.
 */
export function useCharacterSheet(): CharacterSheetEntry | null {
    const userId = useAtomValue(userIdAtom);
    const rooms = useAtomValue(joinedRoomsAtom);
    const { payload: quests } = useUserQuests();

    return useMemo(() => {
        if (!userId) return null;

        const roomInputs: CharacterSheetRoomInput[] = rooms.map((room) => {
            const state = room.currentState;
            const playbookEvent = state?.getStateEvents(DEN_PLAYBOOK_EVENT_TYPE, '');
            const playbookContent = playbookEvent?.getContent<Record<string, unknown>>();
            const playbookId =
                playbookContent && isDenPlaybookPayload(playbookContent)
                    ? (playbookContent as DenPlaybookPayload).playbookId
                    : undefined;

            const roleEventsRaw = state?.getStateEvents(ROLE_EVENT_TYPE);
            const roleEvents = Array.isArray(roleEventsRaw)
                ? roleEventsRaw
                : roleEventsRaw
                  ? [roleEventsRaw]
                  : [];
            const roles: RolePayload[] = [];
            for (const event of roleEvents) {
                const content = event.getContent<Record<string, unknown>>();
                if (isRolePayload(content)) roles.push(content);
            }

            // matrix-js-sdk exposes membership join timestamp on the room
            // member; fall back to the room's last activity if missing.
            const myMembership = room.getMember(userId);
            const joinedAtMs =
                myMembership?.events?.member?.getTs?.() ??
                (typeof room.getLastActiveTimestamp === 'function'
                    ? room.getLastActiveTimestamp()
                    : undefined);

            return {
                roomId: room.roomId,
                roomName: room.name ?? room.roomId,
                playbookId,
                roles,
                joinedAtMs,
            };
        });

        return aggregateCharacterSheet({
            userId,
            completedQuests: quests.completedQuests,
            rooms: roomInputs,
        });
    }, [userId, rooms, quests.completedQuests]);
}
