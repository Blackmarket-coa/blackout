import { useCallback, useMemo, useState } from 'react';
import type { ThreadActivityUpdatedPayload } from '@blackout/protocol';
import {
    aggregateThreadUnread,
    applyThreadActivityUpdate,
} from '@blackout/sdk';

/**
 * Hook backing the left-panel thread unread badge — Workstream C
 * ("Thread unread badge in left-panel updates within one tick of an
 * `m.thread` reply landing", deferred-bodies-schedule-2026-05-01.md).
 *
 * Owns a list of `ThreadActivityUpdatedPayload` entries and exposes
 * the aggregated unread count derived from
 * `aggregateThreadUnread` + the MRU list returned by
 * `applyThreadActivityUpdate`. Pure with respect to React state — the
 * hook never reaches into Matrix or networking; callers wire whatever
 * event source they have (Matrix appservice envelope, polling, etc.)
 * by invoking `pushActivity` from inside their subscription callback.
 *
 * Updates land synchronously in the next React commit ("within one
 * tick") because `pushActivity` is a `setActivities` setter — there is
 * no debounce or batching layer.
 */
export interface ThreadUnreadCountHook {
    /** Activities currently tracked. Sorted newest-first by occurredAt. */
    activities: readonly ThreadActivityUpdatedPayload[];
    /** Aggregated unread count across all tracked activities. */
    unreadCount: number;
    /** Push a new (or updated) activity into the tracked list. */
    pushActivity: (payload: ThreadActivityUpdatedPayload) => void;
    /** Replace the entire tracked list (e.g. after a fresh fetch). */
    setActivities: (next: readonly ThreadActivityUpdatedPayload[]) => void;
    /** Reset to an empty list. */
    reset: () => void;
}

export function useThreadUnreadCount(
    initial: readonly ThreadActivityUpdatedPayload[] = [],
): ThreadUnreadCountHook {
    const [activities, setActivitiesState] = useState<readonly ThreadActivityUpdatedPayload[]>(
        () => [...initial],
    );

    const pushActivity = useCallback((payload: ThreadActivityUpdatedPayload) => {
        setActivitiesState((current) => applyThreadActivityUpdate(current, payload));
    }, []);

    const setActivities = useCallback(
        (next: readonly ThreadActivityUpdatedPayload[]) => {
            setActivitiesState([...next]);
        },
        [],
    );

    const reset = useCallback(() => {
        setActivitiesState([]);
    }, []);

    const unreadCount = useMemo(() => aggregateThreadUnread(activities), [activities]);

    return { activities, unreadCount, pushActivity, setActivities, reset };
}
