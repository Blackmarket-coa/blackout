import type { MentionInboxItem, MentionPriority } from '../right-panel/rightPanelUtils';

export interface InboxEventTriageState {
    resolved?: boolean;
    snoozedUntil?: number;
    remindedAt?: number;
}

export interface InboxUserTriageState {
    readEventIds: Record<string, boolean>;
    events: Record<string, InboxEventTriageState>;
}

export interface InboxTriagePayload {
    version: 1;
    users: Record<string, InboxUserTriageState>;
    updatedAt: number;
}

export interface InboxSection {
    priority: MentionPriority;
    label: string;
    items: MentionInboxItem[];
}

export const EMPTY_TRIAGE_STATE: InboxUserTriageState = {
    readEventIds: {},
    events: {},
};

const PRIORITY_ORDER: MentionPriority[] = ['direct_mention', 'thread_reply', 'keyword_hit'];

const PRIORITY_LABELS: Record<MentionPriority, string> = {
    direct_mention: 'Direct mentions',
    thread_reply: 'Thread replies',
    keyword_hit: 'Keyword hits',
};

export const buildPrioritySections = ({
    items,
    triage,
    now = Date.now(),
}: {
    items: MentionInboxItem[];
    triage: InboxUserTriageState;
    now?: number;
}): InboxSection[] => {
    const unresolvedItems = items.filter((item) => {
        const eventState = triage.events[item.eventId];
        if (!eventState) return true;
        if (eventState.resolved) return false;
        if (typeof eventState.snoozedUntil === 'number' && eventState.snoozedUntil > now) {
            return false;
        }
        return true;
    });

    return PRIORITY_ORDER.map((priority) => ({
        priority,
        label: PRIORITY_LABELS[priority],
        items: unresolvedItems
            .filter((item) => item.priority === priority)
            .sort((a, b) => b.timestamp - a.timestamp),
    })).filter((section) => section.items.length > 0);
};

export const getSnoozedItems = ({
    items,
    triage,
    now = Date.now(),
}: {
    items: MentionInboxItem[];
    triage: InboxUserTriageState;
    now?: number;
}): MentionInboxItem[] =>
    items
        .filter((item) => (triage.events[item.eventId]?.snoozedUntil ?? 0) > now)
        .sort((a, b) => b.timestamp - a.timestamp);

export const getResolvedItems = ({
    items,
    triage,
}: {
    items: MentionInboxItem[];
    triage: InboxUserTriageState;
}): MentionInboxItem[] =>
    items
        .filter((item) => triage.events[item.eventId]?.resolved === true)
        .sort((a, b) => b.timestamp - a.timestamp);

export const normalizeInboxTriagePayload = (payload: unknown): InboxTriagePayload => {
    const content = payload as Partial<InboxTriagePayload>;
    const users =
        content && typeof content === 'object' && content.users && typeof content.users === 'object'
            ? content.users
            : {};

    const normalizedUsers = Object.fromEntries(
        Object.entries(users).map(([userId, state]) => {
            const typed = state as Partial<InboxUserTriageState>;
            const readEventIds =
                typed && typeof typed.readEventIds === 'object' && typed.readEventIds
                    ? Object.fromEntries(
                          Object.entries(typed.readEventIds).filter(([, isRead]) => isRead === true),
                      )
                    : {};

            const events =
                typed && typeof typed.events === 'object' && typed.events
                    ? Object.fromEntries(
                          Object.entries(typed.events)
                              .filter(([, value]) => value && typeof value === 'object')
                              .map(([eventId, value]) => {
                                  const eventState = value as Record<string, unknown>;
                                  return [
                                      eventId,
                                      {
                                          resolved: eventState.resolved === true,
                                          snoozedUntil:
                                              typeof eventState.snoozedUntil === 'number'
                                                  ? eventState.snoozedUntil
                                                  : undefined,
                                          remindedAt:
                                              typeof eventState.remindedAt === 'number'
                                                  ? eventState.remindedAt
                                                  : undefined,
                                      } satisfies InboxEventTriageState,
                                  ];
                              }),
                      )
                    : {};

            return [
                userId,
                {
                    readEventIds,
                    events,
                } satisfies InboxUserTriageState,
            ];
        }),
    );

    return {
        version: 1,
        users: normalizedUsers,
        updatedAt: typeof content?.updatedAt === 'number' ? content.updatedAt : Date.now(),
    };
};

export const createInboxTriagePayload = ({
    userId,
    triage,
}: {
    userId: string;
    triage: InboxUserTriageState;
}): InboxTriagePayload => ({
    version: 1,
    users: {
        [userId]: triage,
    },
    updatedAt: Date.now(),
});
