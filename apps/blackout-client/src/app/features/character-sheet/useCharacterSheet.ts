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
 * Hook: derive a user's character sheet from joined rooms + their quest log.
 *
 * Defaults to the current user (the original v1 self-view). Pass a
 * `targetUserId` to render someone else's sheet — viewers see only the
 * public-facing identity (first playbook, roles held in rooms they both
 * belong to) because Matrix account data is per-user-private and the
 * holder's quest log can't be read by other accounts. We surface an empty
 * quest log in that case rather than fabricating one; the visual idiom
 * stays consistent.
 *
 * Reads room state synchronously (Matrix has it available the moment the
 * room is joined) so the sheet renders without extra round-trips.
 */
export function useCharacterSheet(targetUserId?: string): CharacterSheetEntry | null {
    const viewerId = useAtomValue(userIdAtom);
    const rooms = useAtomValue(joinedRoomsAtom);
    const { payload: quests } = useUserQuests();

    const userId = targetUserId ?? viewerId;
    const isSelfView = userId === viewerId;

    return useMemo(() => {
        if (!userId) return null;

        const roomInputs: CharacterSheetRoomInput[] = [];
        for (const room of rooms) {
            // Cross-user view: only consider rooms the target user is in.
            // Self-view inherits the prior behaviour (every joined room).
            if (!isSelfView && !room.getMember?.(userId)) continue;

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

            // For self-view we use the viewer's own join timestamp; for
            // cross-user view we use the target user's join timestamp on
            // each room.
            const myMembership = room.getMember(userId);
            const joinedAtMs =
                myMembership?.events?.member?.getTs?.() ??
                (typeof room.getLastActiveTimestamp === 'function'
                    ? room.getLastActiveTimestamp()
                    : undefined);

            roomInputs.push({
                roomId: room.roomId,
                roomName: room.name ?? room.roomId,
                playbookId,
                roles,
                joinedAtMs,
            });
        }

        return aggregateCharacterSheet({
            userId,
            // Quests are per-user account data — not readable across users.
            // Cross-user viewers see the public identity only.
            completedQuests: isSelfView ? quests.completedQuests : [],
            rooms: roomInputs,
        });
    }, [userId, isSelfView, rooms, quests.completedQuests]);
}
