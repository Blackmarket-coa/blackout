import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { roomToUnreadAtom } from '../../../state/room/roomToUnread';

/**
 * "About me" — replies, mentions, and highlight-priority messages targeted
 * at the current user. Wraps the existing per-room unread atom so we don't
 * fork the unread bookkeeping; the per-room counts are the source of truth.
 *
 * The brief frames this category as opt-in push only. We don't change push
 * delivery here — push rules continue to follow Matrix's own settings.
 * What changes is the *navigation surface*: a dedicated tab for the things
 * that name *you* specifically, rather than firehose activity.
 */
export interface AboutMeForRoom {
    roomId: string;
    /** Highlight count — mentions or keyword hits that name *me* specifically. */
    highlight: number;
    /** Total unread message count in the room. Useful for the secondary label. */
    total: number;
}

export function useAboutMe(roomId: string | null | undefined): AboutMeForRoom {
    const unreadMap = useAtomValue(roomToUnreadAtom);

    return useMemo(() => {
        if (!roomId) {
            return { roomId: '', highlight: 0, total: 0 };
        }
        const entry = unreadMap.get(roomId);
        return {
            roomId,
            highlight: entry?.highlight ?? 0,
            total: entry?.total ?? 0,
        };
    }, [roomId, unreadMap]);
}
