import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    aggregateThreadUnread,
    type ThreadActivityUpdatedPayload,
} from '@blackout/sdk';

export type ThreadActivityFetcher = {
    listActivity: (options?: {
        limit?: number;
        sinceIso?: string;
    }) => Promise<{ activities: ThreadActivityUpdatedPayload[] }>;
    markActivityRead: (activityId: string) => Promise<unknown>;
};

type Props = {
    fetcher?: ThreadActivityFetcher;
};

const stub: ThreadActivityFetcher = {
    listActivity: async () => ({ activities: [] }),
    markActivityRead: async () => ({}),
};

export function ThreadActivityPage({ fetcher = stub }: Props) {
    const [activities, setActivities] = useState<ThreadActivityUpdatedPayload[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [pending, setPending] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoadError(null);
        try {
            const response = await fetcher.listActivity({ limit: 50 });
            setActivities(response.activities ?? []);
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Failed to load activity.');
        }
    }, [fetcher]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const onMarkRead = useCallback(
        async (activityId: string) => {
            setActionError(null);
            setPending(activityId);
            try {
                await fetcher.markActivityRead(activityId);
                setActivities((prev) =>
                    prev.filter((entry) => entry.activityId !== activityId)
                );
            } catch (error) {
                setActionError(
                    error instanceof Error ? error.message : `Failed to mark ${activityId} read.`
                );
            } finally {
                setPending(null);
            }
        },
        [fetcher]
    );

    const totalUnread = useMemo(() => aggregateThreadUnread(activities), [activities]);

    return (
        <main
            data-testid="thread-activity-page"
            style={{ padding: 16, display: 'grid', gap: 16 }}
        >
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ margin: 0 }}>Thread activity</h1>
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                        Inbox of recent thread starts, replies, and resolutions. Backed by the
                        BKL-011 thread-activity SDK.
                    </p>
                </div>
                <span
                    data-testid="thread-activity-unread-total"
                    style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: 'var(--bg-input)',
                    }}
                >
                    {totalUnread} unread
                </span>
            </header>

            {loadError ? (
                <p data-testid="thread-activity-load-error" role="alert">
                    {loadError}
                </p>
            ) : null}
            {actionError ? (
                <p data-testid="thread-activity-action-error" role="alert">
                    {actionError}
                </p>
            ) : null}

            {activities.length === 0 ? (
                <p
                    data-testid="thread-activity-empty"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    No thread activity in the recent window.
                </p>
            ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                    {activities.map((entry) => (
                        <li
                            key={entry.activityId}
                            data-testid={`thread-activity-${entry.activityId}`}
                            data-kind={entry.kind}
                            style={{
                                border: '1px solid var(--border-default)',
                                borderRadius: 10,
                                padding: 10,
                                display: 'grid',
                                gap: 4,
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <strong>{entry.kind.replace('thread_', '').toUpperCase()}</strong>
                                <small>{entry.occurredAt}</small>
                            </div>
                            <small style={{ color: 'var(--text-secondary)' }}>
                                room: <code>{entry.roomId}</code> · root:{' '}
                                <code>{entry.threadRootEventId}</code> · unread:{' '}
                                {entry.unreadCount}
                            </small>
                            <button
                                type="button"
                                data-testid={`thread-activity-mark-read-${entry.activityId}`}
                                onClick={() => void onMarkRead(entry.activityId)}
                                disabled={pending === entry.activityId}
                            >
                                {pending === entry.activityId ? 'Marking read…' : 'Mark read'}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}

export default ThreadActivityPage;
