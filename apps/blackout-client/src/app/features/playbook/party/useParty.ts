import { useCallback, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import type { Room } from 'matrix-js-sdk';
import { type PlaybookId } from '@blackout/protocol';
import { createPlaybookPayload } from '../../../../lib/bmc-core/playbook';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { joinedRoomsAtom } from '../../../state/rooms';
import {
    CreateRoomKind,
    createRoom,
} from '../../../components/create-room';
import { useSetAnyPlaybook } from '../usePlaybook';

/**
 * J5 — Party formation.
 *
 * "Form a party" is the faster den-creation path for an existing group of
 * users who want to spin a new den off together. It bypasses the
 * 3-question picker by *inheriting* answers from the parent den (members,
 * accent, and a sensible default playbook), so the flow is one screen, not
 * three.
 *
 * The default playbook is Confluence — delegate-style federation is the
 * shape most parties want when they branch off a larger den. Callers can
 * override; every other playbook is selectable in the dialog.
 *
 * The brief is firm that gamification stays inside its banlist carve-out:
 * party formation is *identity-forming, not status-conferring* — no
 * "party level," no XP, no leaderboards. Just a faster path to a room.
 */
export interface FormPartyInput {
    /** Optional party name; defaults to "Party from <parent>". */
    name?: string;
    /** Optional domain sentence; defaults to empty. */
    domain?: string;
    /** Playbook for the new den. Defaults to Confluence. */
    playbookId?: PlaybookId;
    /** Matrix user ids to invite. Defaults to the parent's joined members. */
    invitees?: ReadonlyArray<string>;
}

export interface UsePartyResult {
    /** True iff a "Form a party" affordance should be visible here. */
    available: boolean;
    /** Number of joined members in the parent — drives the affordance. */
    memberCount: number;
    /** Form the party. Returns the new room id on success. */
    formParty: (input?: FormPartyInput) => Promise<string>;
}

export function useParty(parentRoomId: string | null | undefined): UsePartyResult {
    const rooms = useAtomValue(joinedRoomsAtom);
    const mx = useMatrixClient();
    const setPlaybook = useSetAnyPlaybook();

    const parent: Room | undefined = useMemo(
        () => (parentRoomId ? rooms.find((r) => r.roomId === parentRoomId) : undefined),
        [parentRoomId, rooms],
    );

    const memberCount = parent?.getJoinedMemberCount?.() ?? 0;
    const available = memberCount >= 3;

    const formParty = useCallback(
        async (input: FormPartyInput = {}): Promise<string> => {
            if (!parent) throw new Error('useParty: parent room is required');
            if (!available) {
                throw new Error('useParty: parties form from dens of at least three members');
            }

            const playbookId: PlaybookId = input.playbookId ?? 'confluence';
            const cleanedName = (input.name ?? '').trim() || `Party from ${parent.name ?? 'this den'}`;
            const cleanedDomain = (input.domain ?? '').trim();

            const roomId = await createRoom(mx, {
                version: '1',
                parent,
                // Restricted-to-parent so existing members can join without
                // re-invite; the dialog can still emit explicit invites.
                kind: CreateRoomKind.Restricted,
                name: cleanedName,
                topic: cleanedDomain || undefined,
                encryption: true,
                knock: false,
                allowFederation: true,
            });

            const payload = createPlaybookPayload(playbookId, new Date(), {
                name: cleanedName,
                domain: cleanedDomain,
            });
            await setPlaybook(roomId, payload);

            // Explicit invites for the chosen subset of members. Errors are
            // non-fatal — the room is created and the picker can re-invite.
            const me = mx.getUserId() ?? '';
            const seedInvites =
                input.invitees ??
                (parent.getJoinedMembers?.() ?? [])
                    .map((member) => member.userId)
                    .filter((id) => id !== me);
            await Promise.allSettled(
                seedInvites.map((userId) => mx.invite(roomId, userId)),
            );

            return roomId;
        },
        [available, mx, parent, setPlaybook],
    );

    return { available, memberCount, formParty };
}
