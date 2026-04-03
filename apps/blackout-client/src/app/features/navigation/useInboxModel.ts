import { useEffect, useMemo } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { joinedRoomsAtom } from '../../state/rooms';
import { userIdAtom } from '../../state/auth';
import { inboxReadEventIdsAtom, inboxReadLoadedAtom } from '../../state/inbox';
import { getMentionInboxItems } from '../right-panel/rightPanelUtils';
import { useMentionNavigation } from './useMentionNavigation';

const INBOX_ACCOUNT_DATA_KEY = 'blackout.inbox.read.v1';

export const useInboxModel = () => {
  const client = useMatrixClient();
  const rooms = useAtomValue(joinedRoomsAtom);
  const userId = useAtomValue(userIdAtom);
  const [readEventIds, setReadEventIds] = useAtom(inboxReadEventIdsAtom);
  const [loaded, setLoaded] = useAtom(inboxReadLoadedAtom);
  const { markEventRead } = useMentionNavigation();

  const rawItems = useMemo(() => getMentionInboxItems({ rooms, userId }), [rooms, userId]);
  const items = useMemo(
    () => rawItems.map((item) => ({ ...item, unread: item.unread && !readEventIds[item.eventId] })),
    [rawItems, readEventIds],
  );

  useEffect(() => {
    if (!userId || loaded) return;

    const accountEvent = client.getAccountData(INBOX_ACCOUNT_DATA_KEY as never);
    const content = accountEvent?.getContent<Record<string, unknown>>() ?? {};
    const version = typeof content.version === 'number' ? content.version : 1;
    const readByUser = version >= 2 ? (content.users as Record<string, unknown> | undefined)?.[userId] : content[userId];

    if (readByUser && typeof readByUser === 'object' && !Array.isArray(readByUser)) {
      const next = Object.fromEntries(
        Object.entries(readByUser as Record<string, unknown>).filter(([, isRead]) => isRead === true),
      ) as Record<string, boolean>;
      setReadEventIds(next);

      if (version < 2) {
        void client.setAccountData(INBOX_ACCOUNT_DATA_KEY as never, {
          version: 2,
          users: { [userId]: next },
          updatedAt: Date.now(),
        } as never);
      }
    }

    setLoaded(true);
  }, [client, loaded, setLoaded, setReadEventIds, userId]);

  useEffect(() => {
    if (!userId || !loaded) return;
    void client.setAccountData(INBOX_ACCOUNT_DATA_KEY as never, {
      version: 2,
      users: { [userId]: readEventIds },
      updatedAt: Date.now(),
    } as never);
  }, [client, loaded, readEventIds, userId]);

  useEffect(() => {
    const receiptAlignedIds = rawItems
      .filter((item) => item.unread === false && !readEventIds[item.eventId])
      .map((item) => item.eventId);
    if (receiptAlignedIds.length === 0) return;

    setReadEventIds((prev) => ({
      ...prev,
      ...Object.fromEntries(receiptAlignedIds.map((eventId) => [eventId, true])),
    }));
  }, [rawItems, readEventIds, setReadEventIds]);

  const markReadLocal = (eventId: string) => {
    setReadEventIds((prev) => ({ ...prev, [eventId]: true }));
  };

  const markMentionRead = async (roomId: string, eventId: string) => {
    await markEventRead(roomId, eventId);
    markReadLocal(eventId);
  };

  const markAllRead = async () => {
    await Promise.all(items.map((item) => markMentionRead(item.roomId, item.eventId)));
  };

  return {
    items,
    markReadLocal,
    markMentionRead,
    markAllRead,
  };
};

export default useInboxModel;
