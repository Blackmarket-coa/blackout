// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PresenceDigestPage } from '../../../../src/app/features/notifications-presence/PresenceDigestPage';
import type {
    PresenceDigestAcknowledgedEvent,
    PresenceDigestActivity,
    PresenceDigestGeneratedEvent,
    PresenceDigestPayload,
} from '@blackout/protocol';

type DigestFetcher = {
    fetchPresenceDigest: ReturnType<typeof vi.fn>;
    acknowledgePresenceDigest: ReturnType<typeof vi.fn>;
};

const activity = (overrides: Partial<PresenceDigestActivity> = {}): PresenceDigestActivity => ({
    userId: '@alice:example.org',
    lastActiveAt: '2026-05-13T12:00:00.000Z',
    ...overrides,
});

const digestPayload = (
    overrides: Partial<PresenceDigestPayload> = {},
): PresenceDigestPayload => ({
    digestId: 'digest-1',
    generatedAt: '2026-05-13T12:30:00.000Z',
    windowMinutes: 30,
    activities: [activity()],
    ...overrides,
});

const generatedEvent = (
    overrides: Partial<PresenceDigestPayload> = {},
): PresenceDigestGeneratedEvent => ({
    event: 'blackout.notifications.digest.generated',
    roomId: '!notifications:example.org',
    senderId: '@server:example.org',
    occurredAt: '2026-05-13T12:30:00.000Z',
    payload: digestPayload(overrides),
});

const acknowledgedEvent = (digestId: string): PresenceDigestAcknowledgedEvent => ({
    event: 'blackout.notifications.digest.acknowledged',
    roomId: '!notifications:example.org',
    senderId: '@me:example.org',
    occurredAt: '2026-05-13T12:35:00.000Z',
    payload: { digestId, acknowledgedAt: '2026-05-13T12:35:00.000Z' },
});

const createFetcher = (overrides: Partial<DigestFetcher> = {}): DigestFetcher => ({
    fetchPresenceDigest: vi.fn(async () => generatedEvent()),
    acknowledgePresenceDigest: vi.fn(async (digestId: string) => acknowledgedEvent(digestId)),
    ...overrides,
});

const mountPage = async (fetcher: DigestFetcher) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);

    await act(async () => {
        root.render(
            <PresenceDigestPage
                fetchPresenceDigest={
                    fetcher.fetchPresenceDigest as unknown as React.ComponentProps<
                        typeof PresenceDigestPage
                    >['fetchPresenceDigest']
                }
                acknowledgePresenceDigest={
                    fetcher.acknowledgePresenceDigest as unknown as React.ComponentProps<
                        typeof PresenceDigestPage
                    >['acknowledgePresenceDigest']
                }
            />,
        );
        // Allow the initial fetch effect + setState to flush.
        await Promise.resolve();
        await Promise.resolve();
    });

    return { container, root };
};

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('PresenceDigestPage (BKL-004 Port 3 — digest inbox)', () => {
    it('renders the empty-state when fetchPresenceDigest throws', async () => {
        const fetcher = createFetcher({
            fetchPresenceDigest: vi.fn(async () => {
                throw new Error('digest unavailable');
            }),
        });

        const { container } = await mountPage(fetcher);

        expect(container.querySelector('[data-testid="presence-digest-page"]')).toBeTruthy();
        const error = container.querySelector('[data-testid="presence-digest-load-error"]');
        expect(error?.textContent).toContain('digest unavailable');
    });

    it('renders the empty-state when the server returns no activities', async () => {
        const fetcher = createFetcher({
            fetchPresenceDigest: vi.fn(async () =>
                generatedEvent({ activities: [], windowMinutes: 30 }),
            ),
        });

        const { container } = await mountPage(fetcher);

        const summary = container.querySelector('[data-testid="presence-digest-summary"]');
        expect(summary?.textContent).toContain('0 activities in last 30 min');
        // No activity rows render when the list is empty.
        expect(container.querySelector('[data-testid^="presence-digest-activity-"]')).toBeNull();
    });

    it('renders each activity row with the user id and timestamp', async () => {
        const fetcher = createFetcher({
            fetchPresenceDigest: vi.fn(async () =>
                generatedEvent({
                    activities: [
                        activity({ userId: '@alice:example.org' }),
                        activity({
                            userId: '@bob:example.org',
                            lastActiveAt: '2026-05-13T12:15:00.000Z',
                        }),
                    ],
                }),
            ),
        });

        const { container } = await mountPage(fetcher);

        expect(
            container.querySelector(
                '[data-testid="presence-digest-activity-@alice:example.org"]',
            ),
        ).not.toBeNull();
        expect(
            container.querySelector(
                '[data-testid="presence-digest-activity-@bob:example.org"]',
            ),
        ).not.toBeNull();
        const summary = container.querySelector('[data-testid="presence-digest-summary"]');
        expect(summary?.textContent).toContain('2 activities in last 30 min');
    });

    it('refetches with the selected windowMinutes when a window chip is clicked', async () => {
        const fetcher = createFetcher();
        const { container } = await mountPage(fetcher);

        // Initial fetch uses the server default — no windowMinutes argument.
        expect(fetcher.fetchPresenceDigest).toHaveBeenCalledTimes(1);
        expect(fetcher.fetchPresenceDigest.mock.calls[0][0]).toEqual({});

        const hourChip = container.querySelector(
            '[data-testid="presence-digest-window-60m"]',
        ) as HTMLButtonElement;
        expect(hourChip).not.toBeNull();

        await act(async () => {
            hourChip.click();
            await Promise.resolve();
            await Promise.resolve();
        });

        // Second fetch carries the window override.
        expect(fetcher.fetchPresenceDigest).toHaveBeenCalledTimes(2);
        expect(fetcher.fetchPresenceDigest.mock.calls[1][0]).toEqual({ windowMinutes: 60 });
        expect(hourChip.getAttribute('aria-pressed')).toBe('true');
        // The Default chip is no longer active.
        const defaultChip = container.querySelector(
            '[data-testid="presence-digest-window-default"]',
        );
        expect(defaultChip?.getAttribute('aria-pressed')).toBe('false');
    });

    it('acknowledges the digest optimistically and updates to read state', async () => {
        const fetcher = createFetcher();
        const { container } = await mountPage(fetcher);

        const ackBtn = container.querySelector(
            '[data-testid="presence-digest-ack"]',
        ) as HTMLButtonElement;
        expect(ackBtn.getAttribute('data-acked')).toBe('false');
        expect(ackBtn.disabled).toBe(false);

        await act(async () => {
            ackBtn.click();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetcher.acknowledgePresenceDigest).toHaveBeenCalledWith('digest-1');
        expect(ackBtn.getAttribute('data-acked')).toBe('true');
        expect(ackBtn.disabled).toBe(true);
        expect(ackBtn.textContent ?? '').toContain('Acknowledged');
    });

    it('rolls back the optimistic ack and surfaces an alert when the SDK call fails', async () => {
        const fetcher = createFetcher({
            acknowledgePresenceDigest: vi.fn(async () => {
                throw new Error('ack rejected');
            }),
        });

        const { container } = await mountPage(fetcher);

        const ackBtn = container.querySelector(
            '[data-testid="presence-digest-ack"]',
        ) as HTMLButtonElement;

        await act(async () => {
            ackBtn.click();
            await Promise.resolve();
            await Promise.resolve();
        });

        const ackError = container.querySelector('[data-testid="presence-digest-ack-error"]');
        expect(ackError?.textContent).toContain('ack rejected');
        // Rolled back: button is re-enabled and not marked acked.
        expect(ackBtn.getAttribute('data-acked')).toBe('false');
        expect(ackBtn.disabled).toBe(false);
    });
});
