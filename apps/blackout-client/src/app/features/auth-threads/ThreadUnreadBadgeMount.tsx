import React, { useCallback, useEffect, useState } from 'react';
import { useRegistryFetcher } from '../../core/features/RegistryFetcherProvider';
import { ThreadUnreadBadge } from './ThreadUnreadBadge';
import { useThreadUnreadCount } from './useThreadUnreadCount';
import type { ThreadActivityFetcher } from './ThreadActivityPage';

const TARGET_TESTID = 'registry-panel-threads.activity.sidebar';

type Position = { top: number; left: number } | null;

type Props = {
    fetcher?: ThreadActivityFetcher;
};

const stub: ThreadActivityFetcher = {
    listActivity: async () => ({ activities: [] }),
    markActivityRead: async () => ({}),
};

/**
 * Workstream C exit-criterion mount: places `ThreadUnreadBadge` over
 * the threads-activity sidebar entry without modifying the core
 * `RegistrySidebarList`. The badge re-renders synchronously when the
 * underlying `useThreadUnreadCount` state changes ("within one tick of
 * an m.thread reply landing").
 *
 * Activity source: polls the registered `threadActivity` fetcher on
 * mount and on `window.focus`. A push-based Matrix-event subscription
 * is deferred — the focus + mount cadence covers the realistic surface
 * (entering the app, swapping back from another tab).
 *
 * Positioning: locates the threads sidebar entry by its registry
 * `data-testid` and anchors the badge to that entry's top-right via
 * absolute positioning. The parent container must be `position:
 * relative` for the offsets to land in the right coordinate system —
 * `PrimaryRail` wraps the rail in such a container.
 */
export function ThreadUnreadBadgeMount({ fetcher: explicitFetcher }: Props) {
    const ctxFetcher = useRegistryFetcher('threadActivity');
    const fetcher = explicitFetcher ?? ctxFetcher ?? stub;
    const { unreadCount, setActivities } = useThreadUnreadCount();
    const [position, setPosition] = useState<Position>(null);

    const refresh = useCallback(async () => {
        try {
            const response = await fetcher.listActivity({ limit: 50 });
            setActivities(response.activities ?? []);
        } catch {
            // Swallow — the badge falls back to its last successful count.
        }
    }, [fetcher, setActivities]);

    useEffect(() => {
        void refresh();
        const handler = () => {
            void refresh();
        };
        window.addEventListener('focus', handler);
        return () => window.removeEventListener('focus', handler);
    }, [refresh]);

    useEffect(() => {
        if (unreadCount <= 0) {
            setPosition(null);
            return;
        }

        const measure = () => {
            const target = document.querySelector<HTMLElement>(`[data-testid="${TARGET_TESTID}"]`);
            const parent = target?.offsetParent as HTMLElement | null;
            if (!target || !parent) {
                setPosition(null);
                return;
            }
            const targetBox = target.getBoundingClientRect();
            const parentBox = parent.getBoundingClientRect();
            setPosition({
                top: targetBox.top - parentBox.top - 2,
                left: targetBox.right - parentBox.left - 12,
            });
        };

        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [unreadCount]);

    if (unreadCount <= 0) return null;

    return (
        <div
            data-testid="thread-unread-badge-mount"
            style={{
                position: 'absolute',
                top: position?.top ?? 0,
                left: position?.left ?? 0,
                pointerEvents: 'none',
                visibility: position ? 'visible' : 'hidden',
            }}
        >
            <ThreadUnreadBadge count={unreadCount} />
        </div>
    );
}

export default ThreadUnreadBadgeMount;
