import { type MatrixClient, Preset, Visibility } from 'matrix-js-sdk';
import { addRoomIdToMDirect, getDMRoomFor } from '../../utils/matrix';
import { createRoomEncryptionState } from '../../components/create-room';
import {
    FRIENDS_ACCOUNT_DATA_KEY,
    FRIEND_REQUEST_EVENT_TYPE,
    parseFriends,
    withFriend,
    withOutgoing,
    withoutFriend,
    withoutOutgoing,
    type FriendsContent,
} from './friendsModel';

const readFriends = (mx: MatrixClient): FriendsContent => {
    const client = mx as unknown as {
        getAccountData: (type: string) => { getContent: () => unknown } | undefined;
    };
    return parseFriends(client.getAccountData(FRIENDS_ACCOUNT_DATA_KEY)?.getContent());
};

const writeFriends = async (mx: MatrixClient, content: FriendsContent): Promise<void> => {
    const client = mx as unknown as {
        setAccountData: (type: string, content: Record<string, unknown>) => Promise<unknown>;
    };
    await client.setAccountData(FRIENDS_ACCOUNT_DATA_KEY, {
        friends: content.friends,
        outgoing: content.outgoing,
    });
};

/** Find the existing joined DM with `userId`, or create an encrypted one and invite them. */
export const ensureDmRoom = async (mx: MatrixClient, userId: string): Promise<string> => {
    const existing = getDMRoomFor(mx, userId);
    if (existing) return existing.roomId;
    const result = await mx.createRoom({
        is_direct: true,
        invite: [userId],
        visibility: Visibility.Private,
        preset: Preset.TrustedPrivateChat,
        initial_state: [createRoomEncryptionState()],
    });
    await addRoomIdToMDirect(mx, result.room_id, userId);
    return result.room_id;
};

const sendSignal = (mx: MatrixClient, roomId: string, action: 'request' | 'accept' | 'decline') =>
    mx.sendEvent(roomId, FRIEND_REQUEST_EVENT_TYPE as any, { action });

/**
 * Send a friend request: ensure a DM exists (the invite is the delivery), drop
 * a `co.bmc.friend_request` marker into it, and record the user as outgoing.
 */
export const sendFriendRequest = async (mx: MatrixClient, userId: string): Promise<void> => {
    if (!userId || userId === mx.getSafeUserId()) return;
    const roomId = await ensureDmRoom(mx, userId);
    await sendSignal(mx, roomId, 'request');
    await writeFriends(mx, withOutgoing(readFriends(mx), userId));
};

/**
 * Accept a pending request from `userId` whose DM is `roomId`: join the invite,
 * register it as a DM, signal acceptance back to the requester, and add them as
 * a friend.
 */
export const acceptFriendRequest = async (
    mx: MatrixClient,
    { userId, roomId }: { userId: string; roomId: string }
): Promise<void> => {
    if (mx.getRoom(roomId)?.getMyMembership() === 'invite') {
        await mx.joinRoom(roomId);
        await addRoomIdToMDirect(mx, roomId, userId);
    }
    await sendSignal(mx, roomId, 'accept');
    await writeFriends(mx, withFriend(readFriends(mx), userId));
};

/** Decline a pending request: leave the DM invite and clear any outgoing entry. */
export const declineFriendRequest = async (
    mx: MatrixClient,
    { userId, roomId }: { userId: string; roomId: string }
): Promise<void> => {
    try {
        await mx.leave(roomId);
    } catch {
        // Leaving is best-effort; clearing local state below is the meaningful part.
    }
    await writeFriends(mx, withoutOutgoing(readFriends(mx), userId));
};

/** Remove a confirmed friend from this user's list (no cross-user signal). */
export const removeFriend = async (mx: MatrixClient, userId: string): Promise<void> => {
    await writeFriends(mx, withoutFriend(readFriends(mx), userId));
};

/** Open (or create) a DM with `userId` and navigate to it. */
export const startDirectMessageWith = async (
    mx: MatrixClient,
    navigateRoom: (roomId: string) => void,
    userId: string
): Promise<void> => {
    if (!userId || userId === mx.getSafeUserId()) return;
    const roomId = await ensureDmRoom(mx, userId);
    navigateRoom(roomId);
};

/** Reconcile users who accepted my request (now joined our DM) into `friends`. */
export const confirmAcceptedFriends = async (
    mx: MatrixClient,
    acceptedUserIds: string[]
): Promise<void> => {
    if (acceptedUserIds.length === 0) return;
    let next = readFriends(mx);
    for (const userId of acceptedUserIds) next = withFriend(next, userId);
    await writeFriends(mx, next);
};
