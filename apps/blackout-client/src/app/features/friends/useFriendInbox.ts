import { useEffect, useMemo } from 'react';
import type { MatrixEvent, Room } from 'matrix-js-sdk';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useFriends } from './useFriends';
import { confirmAcceptedFriends } from './friendActions';
import {
    FRIEND_REQUEST_EVENT_TYPE,
    deriveFriendState,
    type DmFriendSignal,
    type FriendRequestAction,
} from './friendsModel';

export interface IncomingRequest {
    userId: string;
    roomId: string;
}

const isAction = (value: unknown): value is FriendRequestAction =>
    value === 'request' || value === 'accept' || value === 'decline';

const otherDmMember = (room: Room, myId: string | undefined): string | undefined => {
    const guessed = room.guessDMUserId?.();
    if (guessed && guessed !== myId) return guessed;
    return room
        .getJoinedMembers?.()
        .map((member) => member.userId)
        .find((id) => id !== myId);
};

/** Latest `co.bmc.friend_request` signal in one room, or null if none. */
const latestSignalForRoom = (room: Room, myId: string | undefined): DmFriendSignal | null => {
    const events: MatrixEvent[] = room.getLiveTimeline?.().getEvents?.() ?? [];
    for (let i = events.length - 1; i >= 0; i -= 1) {
        const event = events[i];
        if (event.getType?.() !== FRIEND_REQUEST_EVENT_TYPE) continue;
        const action = (event.getContent?.() as { action?: unknown })?.action;
        if (!isAction(action)) continue;
        const other = otherDmMember(room, myId);
        if (!other) return null;
        return { otherUserId: other, action, fromOther: event.getSender?.() !== myId };
    }
    return null;
};

/**
 * Surfaces incoming friend requests and reconciles accepted ones. Because a
 * recipient can't read a room's timeline before joining, incoming requests are
 * detected from **pending DM invites** (`room.getDMInviter()`). The accept
 * signal rides the now-shared DM as a `co.bmc.friend_request` event, so the
 * original requester reconciles accepted users into their friends list here.
 */
export const useFriendInbox = () => {
    const mx = useMatrixClient();
    const { friends, outgoing } = useFriends();

    const incoming = useMemo<IncomingRequest[]>(
        () =>
            mx
                .getRooms()
                .filter(
                    (room) => room.getMyMembership() === 'invite' && Boolean(room.getDMInviter?.())
                )
                .map((room) => ({ roomId: room.roomId, userId: room.getDMInviter() as string }))
                .filter((entry) => !friends.includes(entry.userId)),
        [mx, friends]
    );

    useEffect(() => {
        if (outgoing.length === 0) return;
        const myId = mx.getSafeUserId();
        const signals = mx
            .getRooms()
            .map((room) => latestSignalForRoom(room, myId))
            .filter((signal): signal is DmFriendSignal => signal !== null);
        const { accepted } = deriveFriendState(signals, friends);
        const toAdd = accepted.filter((id) => outgoing.includes(id));
        if (toAdd.length > 0) void confirmAcceptedFriends(mx, toAdd);
    }, [mx, outgoing, friends]);

    return { incoming };
};
