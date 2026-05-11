/**
 * Character-sheet aggregator (J4 + J6).
 *
 * Pure inputs → pure output: given the user's joined-room state and their
 * completed-quest record, produce the stat-block + quest-log payload the
 * Character Sheet UI renders.
 *
 * The brief frames the sheet as "identity-forming, not status-conferring":
 * narrative beats from completed quests, the playbook the user first
 * planted under, the roles they currently hold across dens. No XP, no
 * levels, no leaderboards. Visible to the user themselves by default —
 * the sharing-with-others surface is deferred.
 */

import type { CompletedQuest, PlaybookId, RolePayload } from '@blackout/protocol';
import { QUEST_NARRATIVE } from './questDetection';

export interface CharacterSheetRoomInput {
    roomId: string;
    /** Room name for display. */
    roomName: string;
    /** Playbook attached to the room, if any. */
    playbookId?: PlaybookId;
    /** Roles attached to the room (state events). */
    roles: ReadonlyArray<RolePayload>;
    /** ms timestamp the user joined the room (drives "first playbook"). */
    joinedAtMs?: number;
}

export interface CharacterSheetInput {
    userId: string;
    /** The user's `co.bmc.user.quests` completedQuests array. */
    completedQuests: ReadonlyArray<CompletedQuest>;
    /** One entry per joined room. */
    rooms: ReadonlyArray<CharacterSheetRoomInput>;
}

export interface CharacterSheetRoleHeld {
    roomId: string;
    roomName: string;
    roleId: string;
    roleName: string;
    /** ISO end of current term. */
    termEnd: string;
}

export interface CharacterSheetEntry {
    /** The user we're rendering the sheet for. */
    userId: string;
    /** Playbook of the user's earliest-joined den; null if they never planted one. */
    firstPlaybook: PlaybookId | null;
    /** Roles the user currently holds, across every joined den. */
    rolesHeld: ReadonlyArray<CharacterSheetRoleHeld>;
    /** Number of dens the user has joined. Cheap stat for the header. */
    densJoined: number;
    /** Completed-quest log, newest-first. */
    questLog: ReadonlyArray<{
        id: CompletedQuest['id'];
        completedAt: string;
        roomId?: string;
        narrative: string;
    }>;
}

export function aggregateCharacterSheet(input: CharacterSheetInput): CharacterSheetEntry {
    const rooms = [...input.rooms].sort((a, b) => (a.joinedAtMs ?? 0) - (b.joinedAtMs ?? 0));

    // First-planted playbook: the earliest room with a playbook id wins.
    let firstPlaybook: PlaybookId | null = null;
    for (const room of rooms) {
        if (room.playbookId) {
            firstPlaybook = room.playbookId;
            break;
        }
    }

    const rolesHeld: CharacterSheetRoleHeld[] = [];
    for (const room of rooms) {
        for (const role of room.roles) {
            if (role.holderId !== input.userId) continue;
            rolesHeld.push({
                roomId: room.roomId,
                roomName: room.roomName,
                roleId: role.roleId,
                roleName: role.name,
                termEnd: role.termEnd,
            });
        }
    }

    const questLog = [...input.completedQuests]
        .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))
        .map((entry) => ({
            id: entry.id,
            completedAt: entry.completedAt,
            roomId: entry.roomId,
            narrative: QUEST_NARRATIVE[entry.id],
        }));

    return {
        userId: input.userId,
        firstPlaybook,
        rolesHeld,
        densJoined: input.rooms.length,
        questLog,
    };
}
