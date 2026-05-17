// @vitest-environment jsdom
import React, { useImperativeHandle, forwardRef } from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ThreadActivityUpdatedPayload } from '@blackout/protocol';

import {
    useThreadUnreadCount,
    type ThreadUnreadCountHook,
} from '../../../../src/app/features/auth-threads/useThreadUnreadCount';
import { ThreadUnreadBadge } from '../../../../src/app/features/auth-threads/ThreadUnreadBadge';

const activity = (
    overrides: Partial<ThreadActivityUpdatedPayload> = {},
): ThreadActivityUpdatedPayload => ({
    activityId: 'act-1',
    threadRootEventId: '$root1',
    roomId: '!room:example.org',
    kind: 'thread_replied',
    unreadCount: 1,
    occurredAt: '2026-05-13T12:00:00.000Z',
    ...overrides,
});

type HarnessHandle = {
    api: ThreadUnreadCountHook;
};

const HookHarness = forwardRef<
    HarnessHandle,
    { initial?: readonly ThreadActivityUpdatedPayload[] }
>(({ initial }, ref) => {
    const api = useThreadUnreadCount(initial);
    useImperativeHandle(ref, () => ({ api }), [api]);
    return (
        <>
            <span data-testid="harness-count">{api.unreadCount}</span>
            <span data-testid="harness-activity-count">{api.activities.length}</span>
            <ThreadUnreadBadge count={api.unreadCount} />
        </>
    );
});
HookHarness.displayName = 'HookHarness';

const mountHarness = async (initial?: readonly ThreadActivityUpdatedPayload[]) => {
    const ref = React.createRef<HarnessHandle>();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<HookHarness ref={ref} initial={initial} />);
        await Promise.resolve();
    });
    return { container, root, ref };
};

const getApi = (ref: React.RefObject<HarnessHandle>): ThreadUnreadCountHook => {
    if (!ref.current) throw new Error('HookHarness ref not populated');
    return ref.current.api;
};

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('useThreadUnreadCount (Workstream C — thread unread aggregation)', () => {
    it('starts at zero with an empty initial list', async () => {
        const { container } = await mountHarness();
        expect(container.querySelector('[data-testid="harness-count"]')?.textContent).toBe('0');
        expect(
            container.querySelector('[data-testid="harness-activity-count"]')?.textContent,
        ).toBe('0');
        // Badge hides when count is zero.
        expect(container.querySelector('[data-testid="thread-unread-badge"]')).toBeNull();
    });

    it('aggregates the initial activities', async () => {
        const { container } = await mountHarness([
            activity({ activityId: 'a1', unreadCount: 3 }),
            activity({ activityId: 'a2', unreadCount: 5 }),
        ]);
        expect(container.querySelector('[data-testid="harness-count"]')?.textContent).toBe('8');
        const badge = container.querySelector('[data-testid="thread-unread-badge"]');
        expect(badge?.getAttribute('data-count')).toBe('8');
        expect(badge?.textContent).toBe('8');
    });

    it('increments the count when pushActivity adds a new activity', async () => {
        const { container, ref } = await mountHarness();

        await act(async () => {
            getApi(ref).pushActivity(activity({ activityId: 'new-1', unreadCount: 2 }));
            await Promise.resolve();
        });

        expect(container.querySelector('[data-testid="harness-count"]')?.textContent).toBe('2');
        expect(
            container.querySelector('[data-testid="harness-activity-count"]')?.textContent,
        ).toBe('1');
        expect(
            container.querySelector('[data-testid="thread-unread-badge"]')?.textContent,
        ).toBe('2');
    });

    it('deduplicates by activityId — newer update replaces prior count for same activity', async () => {
        const { container, ref } = await mountHarness([
            activity({ activityId: 'thread-a', unreadCount: 3 }),
        ]);
        expect(container.querySelector('[data-testid="harness-count"]')?.textContent).toBe('3');

        // Same activityId, larger unreadCount — replaces, doesn't add.
        await act(async () => {
            getApi(ref).pushActivity(
                activity({
                    activityId: 'thread-a',
                    unreadCount: 7,
                    occurredAt: '2026-05-13T13:00:00.000Z',
                }),
            );
            await Promise.resolve();
        });

        expect(container.querySelector('[data-testid="harness-count"]')?.textContent).toBe('7');
        // Still only one activity tracked.
        expect(
            container.querySelector('[data-testid="harness-activity-count"]')?.textContent,
        ).toBe('1');
    });

    it('removes an activity when its updated unreadCount drops to zero', async () => {
        const { container, ref } = await mountHarness([
            activity({ activityId: 'a-keep', unreadCount: 2 }),
            activity({ activityId: 'a-drop', unreadCount: 3 }),
        ]);
        expect(container.querySelector('[data-testid="harness-count"]')?.textContent).toBe('5');

        await act(async () => {
            getApi(ref).pushActivity(
                activity({ activityId: 'a-drop', unreadCount: 0 }),
            );
            await Promise.resolve();
        });

        expect(container.querySelector('[data-testid="harness-count"]')?.textContent).toBe('2');
        expect(
            container.querySelector('[data-testid="harness-activity-count"]')?.textContent,
        ).toBe('1');
    });

    it('replaces the entire list with setActivities', async () => {
        const { container, ref } = await mountHarness([
            activity({ activityId: 'a1', unreadCount: 2 }),
        ]);
        expect(container.querySelector('[data-testid="harness-count"]')?.textContent).toBe('2');

        await act(async () => {
            getApi(ref).setActivities([
                activity({ activityId: 'b1', unreadCount: 4 }),
                activity({ activityId: 'b2', unreadCount: 1 }),
            ]);
            await Promise.resolve();
        });

        expect(container.querySelector('[data-testid="harness-count"]')?.textContent).toBe('5');
        expect(
            container.querySelector('[data-testid="harness-activity-count"]')?.textContent,
        ).toBe('2');
    });

    it('resets to an empty list on reset()', async () => {
        const { container, ref } = await mountHarness([
            activity({ activityId: 'a1', unreadCount: 4 }),
        ]);

        await act(async () => {
            getApi(ref).reset();
            await Promise.resolve();
        });

        expect(container.querySelector('[data-testid="harness-count"]')?.textContent).toBe('0');
        expect(
            container.querySelector('[data-testid="harness-activity-count"]')?.textContent,
        ).toBe('0');
        expect(container.querySelector('[data-testid="thread-unread-badge"]')).toBeNull();
    });
});

describe('ThreadUnreadBadge', () => {
    const renderBadge = async (props: { count: number; maxDisplayed?: number; ariaLabel?: string }) => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        await act(async () => {
            root.render(<ThreadUnreadBadge {...props} />);
            await Promise.resolve();
        });
        return container;
    };

    it('returns null when count is zero or negative', async () => {
        const zero = await renderBadge({ count: 0 });
        expect(zero.querySelector('[data-testid="thread-unread-badge"]')).toBeNull();
        const negative = await renderBadge({ count: -3 });
        expect(negative.querySelector('[data-testid="thread-unread-badge"]')).toBeNull();
    });

    it('returns null when count is not finite', async () => {
        const container = await renderBadge({ count: Number.NaN });
        expect(container.querySelector('[data-testid="thread-unread-badge"]')).toBeNull();
    });

    it('renders the count and a semantic aria-label', async () => {
        const container = await renderBadge({ count: 5 });
        const badge = container.querySelector('[data-testid="thread-unread-badge"]');
        expect(badge).not.toBeNull();
        expect(badge?.textContent).toBe('5');
        expect(badge?.getAttribute('role')).toBe('status');
        expect(badge?.getAttribute('aria-label')).toBe('5 unread thread replies');
    });

    it('uses singular "reply" in the aria-label when count is exactly 1', async () => {
        const container = await renderBadge({ count: 1 });
        const badge = container.querySelector('[data-testid="thread-unread-badge"]');
        expect(badge?.getAttribute('aria-label')).toBe('1 unread thread reply');
        expect(badge?.textContent).toBe('1');
    });

    it('caps the display at "99+" by default for counts above 99', async () => {
        const container = await renderBadge({ count: 250 });
        const badge = container.querySelector('[data-testid="thread-unread-badge"]');
        expect(badge?.textContent).toBe('99+');
        // The data-count attribute keeps the precise value for testing.
        expect(badge?.getAttribute('data-count')).toBe('250');
    });

    it('honors a custom maxDisplayed cap', async () => {
        const container = await renderBadge({ count: 12, maxDisplayed: 9 });
        const badge = container.querySelector('[data-testid="thread-unread-badge"]');
        expect(badge?.textContent).toBe('9+');
    });

    it('renders the exact count when it equals maxDisplayed', async () => {
        const container = await renderBadge({ count: 99 });
        const badge = container.querySelector('[data-testid="thread-unread-badge"]');
        expect(badge?.textContent).toBe('99');
    });

    it('uses a caller-provided ariaLabel override', async () => {
        const container = await renderBadge({ count: 4, ariaLabel: '4 unread threads in #general' });
        const badge = container.querySelector('[data-testid="thread-unread-badge"]');
        expect(badge?.getAttribute('aria-label')).toBe('4 unread threads in #general');
    });
});
