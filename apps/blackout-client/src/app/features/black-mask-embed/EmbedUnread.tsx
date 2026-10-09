import React from 'react';
import { UnreadBadge } from '../../components/unread-badge';
import { useRoomUnread } from '../../state/hooks/unread';
import { roomToUnreadAtom } from '../../state/room/roomToUnread';

/**
 * Unread indicator for one room or canopy. On by default in the panel
 * (operator decision, 2026-10-06) with no switch to turn it off here; the
 * panel has no settings beyond sign-in.
 *
 * Reads the same live unread map the full app's room list uses
 * (`state/room/roomToUnread`, which rolls den counts up into their canopies),
 * so the panel and the app agree. It shows counts that the homeserver already
 * syncs to this session; it sends nothing anywhere.
 */
export const EmbedUnread = ({ roomId }: { roomId: string }) => {
    const unread = useRoomUnread(roomId, roomToUnreadAtom);
    if (!unread || (unread.total <= 0 && unread.highlight <= 0)) return null;
    const label =
        unread.highlight > 0
            ? `${unread.total} unread, ${unread.highlight} ${
                  unread.highlight === 1 ? 'mention' : 'mentions'
              }`
            : `${unread.total} unread`;
    return (
        <span data-testid="embed-unread" aria-label={label} title={label}>
            <UnreadBadge highlight={unread.highlight > 0} count={unread.total} />
        </span>
    );
};

export default EmbedUnread;
