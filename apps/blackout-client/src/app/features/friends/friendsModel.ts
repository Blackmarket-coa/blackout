/**
 * Matrix-native friend model. A user's own view of their friendships lives in
 * private `co.bmc.friends` account data; the cross-user signal (request /
 * accept / decline) is a `co.bmc.friend_request` timeline event sent into the
 * DM the two users share. This module is pure (account-data transforms + signal
 * derivation) so the handshake logic is unit-testable without a live client.
 */

export const FRIENDS_ACCOUNT_DATA_KEY = 'co.bmc.friends';
export const FRIEND_REQUEST_EVENT_TYPE = 'co.bmc.friend_request';

export type FriendRequestAction = 'request' | 'accept' | 'decline';

export interface FriendsContent {
    /** Confirmed friends (this user's view). */
    friends: string[];
    /** Users this user has sent a request to and not yet confirmed. */
    outgoing: string[];
}

const isUserId = (value: unknown): value is string =>
    typeof value === 'string' && /^@[^:\s]+:[^:\s]+$/.test(value);

const cleanList = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    const out: string[] = [];
    for (const item of value) {
        if (isUserId(item) && !out.includes(item)) out.push(item);
    }
    return out;
};

export const parseFriends = (content: unknown): FriendsContent => {
    const record = (content ?? {}) as Record<string, unknown>;
    return { friends: cleanList(record.friends), outgoing: cleanList(record.outgoing) };
};

export const isFriend = (content: FriendsContent, userId: string): boolean =>
    content.friends.includes(userId);

export const isOutgoing = (content: FriendsContent, userId: string): boolean =>
    content.outgoing.includes(userId);

/** Add a confirmed friend (and drop any matching outgoing request). */
export const withFriend = (content: FriendsContent, userId: string): FriendsContent => ({
    friends: content.friends.includes(userId) ? content.friends : [...content.friends, userId],
    outgoing: content.outgoing.filter((id) => id !== userId),
});

export const withoutFriend = (content: FriendsContent, userId: string): FriendsContent => ({
    friends: content.friends.filter((id) => id !== userId),
    outgoing: content.outgoing.filter((id) => id !== userId),
});

export const withOutgoing = (content: FriendsContent, userId: string): FriendsContent => ({
    friends: content.friends,
    outgoing:
        content.friends.includes(userId) || content.outgoing.includes(userId)
            ? content.outgoing
            : [...content.outgoing, userId],
});

export const withoutOutgoing = (content: FriendsContent, userId: string): FriendsContent => ({
    friends: content.friends,
    outgoing: content.outgoing.filter((id) => id !== userId),
});

/**
 * The latest `co.bmc.friend_request` signal observed in one DM: who the other
 * member is, the last action, and whether that last event came from them (vs me).
 */
export interface DmFriendSignal {
    otherUserId: string;
    action: FriendRequestAction;
    fromOther: boolean;
}

export interface DerivedFriendState {
    /** Requests from others awaiting my accept/decline. */
    incoming: string[];
    /** Users who accepted my request — reconcile into `friends`. */
    accepted: string[];
    /** Users who declined my request — reconcile out of `outgoing`. */
    declined: string[];
}

/**
 * Reduce the per-DM friend-request signals against my confirmed friends into
 * actionable buckets for the inbox and for reconciling my own account data.
 */
export const deriveFriendState = (
    signals: DmFriendSignal[],
    friends: string[]
): DerivedFriendState => {
    const friendSet = new Set(friends);
    const incoming: string[] = [];
    const accepted: string[] = [];
    const declined: string[] = [];

    for (const signal of signals) {
        if (!signal.fromOther) continue;
        if (signal.action === 'request' && !friendSet.has(signal.otherUserId)) {
            if (!incoming.includes(signal.otherUserId)) incoming.push(signal.otherUserId);
        } else if (signal.action === 'accept' && !friendSet.has(signal.otherUserId)) {
            if (!accepted.includes(signal.otherUserId)) accepted.push(signal.otherUserId);
        } else if (signal.action === 'decline') {
            if (!declined.includes(signal.otherUserId)) declined.push(signal.otherUserId);
        }
    }

    return { incoming, accepted, declined };
};
