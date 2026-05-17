// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThreadActivityUpdatedPayload } from '@blackout/protocol';
import { ThreadUnreadBadgeMount } from '../../../../src/app/features/auth-threads/ThreadUnreadBadgeMount';
import type { ThreadActivityFetcher } from '../../../../src/app/features/auth-threads/ThreadActivityPage';

const makeActivity = (
    overrides: Partial<ThreadActivityUpdatedPayload> = {},
): ThreadActivityUpdatedPayload => ({
    activityId: 'a-1',
    threadRootEventId: '$root:example.org',
    roomId: '!room:example.org',
    kind: 'thread_replied',
    unreadCount: 3,
    occurredAt: '2026-05-16T00:00:00.000Z',
    ...overrides,
});

const renderWithTarget = async (fetcher: ThreadActivityFetcher) => {
    document.body.innerHTML = '';
    // Sidebar target the mount anchors against.
    const railRoot = document.createElement('div');
    railRoot.style.position = 'relative';
    const target = document.createElement('a');
    target.setAttribute('data-testid', 'registry-panel-threads.activity.sidebar');
    target.textContent = 'T';
    railRoot.appendChild(target);
    document.body.appendChild(railRoot);

    const mountHost = document.createElement('div');
    railRoot.appendChild(mountHost);
    const root = ReactDOM.createRoot(mountHost);

    await act(async () => {
        root.render(<ThreadUnreadBadgeMount fetcher={fetcher} />);
        await Promise.resolve();
    });
    // Allow the polling effect's setActivities to flush.
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });

    return { railRoot, mountHost, root };
};

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('ThreadUnreadBadgeMount (Workstream C — sidebar badge mount)', () => {
    it('renders the aggregated unread count after polling the fetcher', async () => {
        const fetcher: ThreadActivityFetcher = {
            listActivity: vi.fn().mockResolvedValue({
                activities: [
                    makeActivity({ activityId: 'a-1', unreadCount: 2 }),
                    makeActivity({
                        activityId: 'a-2',
                        threadRootEventId: '$other:example.org',
                        unreadCount: 3,
                    }),
                ],
            }),
            markActivityRead: vi.fn(),
        };

        const { railRoot } = await renderWithTarget(fetcher);
        const badge = railRoot.querySelector('[data-testid="thread-unread-badge"]');
        expect(badge).not.toBeNull();
        expect(badge?.getAttribute('data-count')).toBe('5');
        expect(fetcher.listActivity).toHaveBeenCalledWith({ limit: 50 });
    });

    it('renders nothing when the fetcher returns zero unread', async () => {
        const fetcher: ThreadActivityFetcher = {
            listActivity: vi.fn().mockResolvedValue({ activities: [] }),
            markActivityRead: vi.fn(),
        };

        const { railRoot } = await renderWithTarget(fetcher);
        expect(railRoot.querySelector('[data-testid="thread-unread-badge"]')).toBeNull();
        expect(railRoot.querySelector('[data-testid="thread-unread-badge-mount"]')).toBeNull();
    });

    it('refreshes the count on window focus', async () => {
        const fetcher: ThreadActivityFetcher = {
            listActivity: vi
                .fn()
                .mockResolvedValueOnce({ activities: [makeActivity({ unreadCount: 1 })] })
                .mockResolvedValueOnce({
                    activities: [makeActivity({ unreadCount: 4 })],
                }),
            markActivityRead: vi.fn(),
        };

        const { railRoot } = await renderWithTarget(fetcher);
        expect(
            railRoot.querySelector('[data-testid="thread-unread-badge"]')?.getAttribute('data-count'),
        ).toBe('1');

        await act(async () => {
            window.dispatchEvent(new Event('focus'));
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetcher.listActivity).toHaveBeenCalledTimes(2);
        expect(
            railRoot.querySelector('[data-testid="thread-unread-badge"]')?.getAttribute('data-count'),
        ).toBe('4');
    });

    it('swallows fetch errors and keeps the badge unmounted on first failure', async () => {
        const fetcher: ThreadActivityFetcher = {
            listActivity: vi.fn().mockRejectedValue(new Error('network down')),
            markActivityRead: vi.fn(),
        };

        const { railRoot } = await renderWithTarget(fetcher);
        expect(railRoot.querySelector('[data-testid="thread-unread-badge"]')).toBeNull();
        expect(fetcher.listActivity).toHaveBeenCalled();
    });
});
