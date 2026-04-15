import { useEffect, useMemo } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useMatrixClient } from '../../hooks/bmc-useMatrixClient';
import { joinedRoomsAtom } from '../../state/bmc-rooms';
import { userIdAtom } from '../../state/bmc-auth';
import { inboxActiveTriageAtom, inboxActiveUserIdAtom, inboxReadLoadedAtom } from '../../state/inbox';
import { getMentionInboxItems } from '../right-panel/rightPanelUtils';
import {
    buildPrioritySections,
    createInboxTriagePayload,
    EMPTY_TRIAGE_STATE,
    getResolvedItems,
    getSnoozedItems,
    normalizeInboxTriagePayload,
} from './inboxTriage';
import { useMentionNavigation } from './useMentionNavigation';

const INBOX_ACCOUNT_DATA_KEY = 'blackout.inbox.triage.v1';
const DEFAULT_SNOOZE_MS = 30 * 60 * 1000;

export const useInboxModel = () => {
    const client = useMatrixClient();
    const rooms = useAtomValue(joinedRoomsAtom);
    const userId = useAtomValue(userIdAtom);
    const [triage, setTriage] = useAtom(inboxActiveTriageAtom);
    const setActiveUserId = useSetAtom(inboxActiveUserIdAtom);
    const [loaded, setLoaded] = useAtom(inboxReadLoadedAtom);
    const { markEventRead } = useMentionNavigation();

    useEffect(() => {
        setActiveUserId(userId);
    }, [setActiveUserId, userId]);

    const rawItems = useMemo(() => getMentionInboxItems({ rooms, userId }), [rooms, userId]);
    const items = useMemo(
        () =>
            rawItems.map((item) => ({
                ...item,
                unread: item.unread && !triage.readEventIds[item.eventId],
            })),
        [rawItems, triage.readEventIds],
    );

    const prioritySections = useMemo(
        () => buildPrioritySections({ items, triage }),
        [items, triage],
    );
    const snoozedItems = useMemo(() => getSnoozedItems({ items, triage }), [items, triage]);
    const resolvedItems = useMemo(() => getResolvedItems({ items, triage }), [items, triage]);

    useEffect(() => {
        if (!userId || loaded) return;

        const accountEvent = client.getAccountData(INBOX_ACCOUNT_DATA_KEY as never);
        const content = normalizeInboxTriagePayload(
            accountEvent?.getContent<Record<string, unknown>>() ?? {},
        );
        setTriage(content.users[userId] ?? EMPTY_TRIAGE_STATE);
        setLoaded(true);
    }, [client, loaded, setLoaded, setTriage, userId]);

    useEffect(() => {
        if (!userId || !loaded) return;
        void client.setAccountData(
            INBOX_ACCOUNT_DATA_KEY as never,
            createInboxTriagePayload({ userId, triage }) as never,
        );
    }, [client, loaded, triage, userId]);

    useEffect(() => {
        const receiptAlignedIds = rawItems
            .filter((item) => item.unread === false && !triage.readEventIds[item.eventId])
            .map((item) => item.eventId);
        if (receiptAlignedIds.length === 0) return;

        setTriage((prev) => ({
            ...prev,
            readEventIds: {
                ...prev.readEventIds,
                ...Object.fromEntries(receiptAlignedIds.map((eventId) => [eventId, true])),
            },
        }));
    }, [rawItems, setTriage, triage.readEventIds]);

    const markReadLocal = (eventId: string) => {
        setTriage((prev) => ({
            ...prev,
            readEventIds: { ...prev.readEventIds, [eventId]: true },
        }));
    };

    const markMentionRead = async (roomId: string, eventId: string) => {
        await markEventRead(roomId, eventId);
        markReadLocal(eventId);
    };

    const markAllRead = async () => {
        await Promise.all(items.map((item) => markMentionRead(item.roomId, item.eventId)));
    };

    const toggleResolved = (eventId: string, resolved: boolean) => {
        setTriage((prev) => ({
            ...prev,
            events: {
                ...prev.events,
                [eventId]: {
                    ...prev.events[eventId],
                    resolved,
                },
            },
        }));
    };

    const snoozeItem = (eventId: string, durationMs = DEFAULT_SNOOZE_MS) => {
        setTriage((prev) => ({
            ...prev,
            events: {
                ...prev.events,
                [eventId]: {
                    ...prev.events[eventId],
                    snoozedUntil: Date.now() + durationMs,
                    remindedAt: Date.now(),
                },
            },
        }));
    };

    const clearSnooze = (eventId: string) => {
        setTriage((prev) => ({
            ...prev,
            events: {
                ...prev.events,
                [eventId]: {
                    ...prev.events[eventId],
                    snoozedUntil: undefined,
                },
            },
        }));
    };

    return {
        items,
        prioritySections,
        snoozedItems,
        resolvedItems,
        markReadLocal,
        markMentionRead,
        markAllRead,
        toggleResolved,
        snoozeItem,
        clearSnooze,
    };
};

export default useInboxModel;
