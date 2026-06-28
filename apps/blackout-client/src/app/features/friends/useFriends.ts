import { useCallback, useMemo } from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useAccountData } from '../../hooks/useAccountData';
import { FRIENDS_ACCOUNT_DATA_KEY, parseFriends, type FriendsContent } from './friendsModel';

/**
 * Reads the current user's private `co.bmc.friends` account data reactively and
 * exposes friend/outgoing membership plus a writer. The cross-user request
 * handshake lives in `friendActions`; this hook is only the local view.
 */
export const useFriends = () => {
    const mx = useMatrixClient();
    const event = useAccountData(FRIENDS_ACCOUNT_DATA_KEY);

    const content = useMemo(() => parseFriends(event?.getContent()), [event]);

    const setContent = useCallback(
        async (next: FriendsContent) => {
            const client = mx as unknown as {
                setAccountData: (
                    type: string,
                    content: Record<string, unknown>
                ) => Promise<unknown>;
            };
            await client.setAccountData(FRIENDS_ACCOUNT_DATA_KEY, {
                friends: next.friends,
                outgoing: next.outgoing,
            });
        },
        [mx]
    );

    return {
        content,
        friends: content.friends,
        outgoing: content.outgoing,
        isFriend: useCallback((userId: string) => content.friends.includes(userId), [content]),
        isOutgoing: useCallback((userId: string) => content.outgoing.includes(userId), [content]),
        setContent,
    };
};
