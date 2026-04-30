// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    AuthDelegatedLoginPage,
    ThreadActivityPage,
    type AuthFetcher,
    type ThreadActivityFetcher,
} from '../../../../src/app/features/auth-threads';
import type { ThreadActivityUpdatedPayload } from '@blackout/sdk';

const mount = async (ui: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(ui);
        await Promise.resolve();
        await Promise.resolve();
    });
    return { container, root };
};

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('AuthDelegatedLoginPage (BKL-011 finished UI)', () => {
    const baseFetcher = (overrides: Partial<AuthFetcher> = {}): AuthFetcher => ({
        beginOidcLogin: vi.fn(async () => ({
            authorizationUrl: 'https://idp.example/authorize?x',
            scopes: ['openid'],
        })),
        continueOidcSession: vi.fn(async () => ({
            payload: {
                subject: '@a:srv',
                issuer: 'https://idp.example',
                issuedAt: '2026-04-30T00:00:00.000Z',
                expiresAt: '2026-04-30T01:00:00.000Z',
                reason: 'refresh' as const,
            },
        })),
        signOut: vi.fn(async () => ({})),
        ...overrides,
    });

    it('renders empty session state and starts an OIDC login', async () => {
        const fetcher = baseFetcher();
        const { container } = await mount(<AuthDelegatedLoginPage fetcher={fetcher} />);

        expect(container.querySelector('[data-testid="auth-session-empty"]')).toBeTruthy();

        const begin = container.querySelector(
            '[data-testid="auth-begin-submit"]'
        ) as HTMLButtonElement;

        await act(async () => {
            begin.click();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetcher.beginOidcLogin).toHaveBeenCalledTimes(1);
        const url = container.querySelector('[data-testid="auth-bootstrap-url"]');
        expect(url?.textContent).toContain('https://idp.example/authorize');
    });

    it('continues a session and reports active vs expired status against a fixed clock', async () => {
        const fetcher = baseFetcher();
        const { container } = await mount(
            <AuthDelegatedLoginPage fetcher={fetcher} nowIso="2026-04-30T00:30:00.000Z" />
        );

        const refresh = container.querySelector(
            '[data-testid="auth-continue-refresh"]'
        ) as HTMLButtonElement;

        await act(async () => {
            refresh.click();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetcher.continueOidcSession).toHaveBeenCalledWith({ reason: 'refresh' });
        const summary = container.querySelector('[data-testid="auth-session-summary"]');
        expect(summary?.textContent).toContain('active');
    });

    it('shows expired status when the clock is past expiresAt', async () => {
        const fetcher = baseFetcher({
            continueOidcSession: vi.fn(async () => ({
                payload: {
                    subject: '@a:srv',
                    issuer: 'https://idp.example',
                    issuedAt: '2026-04-30T00:00:00.000Z',
                    expiresAt: '2026-04-30T00:10:00.000Z',
                    reason: 'refresh' as const,
                },
            })),
        });
        const { container } = await mount(
            <AuthDelegatedLoginPage fetcher={fetcher} nowIso="2026-04-30T01:00:00.000Z" />
        );

        const refresh = container.querySelector(
            '[data-testid="auth-continue-refresh"]'
        ) as HTMLButtonElement;

        await act(async () => {
            refresh.click();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(container.querySelector('[data-testid="auth-session-summary"]')?.textContent).toContain(
            'expired'
        );
    });

    it('signs out and clears the local session', async () => {
        const fetcher = baseFetcher();
        const { container } = await mount(<AuthDelegatedLoginPage fetcher={fetcher} />);

        await act(async () => {
            (
                container.querySelector('[data-testid="auth-continue-refresh"]') as HTMLButtonElement
            ).click();
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(container.querySelector('[data-testid="auth-session-summary"]')).toBeTruthy();

        await act(async () => {
            (
                container.querySelector('[data-testid="auth-sign-out"]') as HTMLButtonElement
            ).click();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetcher.signOut).toHaveBeenCalled();
        expect(container.querySelector('[data-testid="auth-session-empty"]')).toBeTruthy();
    });
});

describe('ThreadActivityPage (BKL-011 finished UI)', () => {
    const activity = (
        overrides: Partial<ThreadActivityUpdatedPayload> = {}
    ): ThreadActivityUpdatedPayload => ({
        activityId: 'a-1',
        threadRootEventId: '$root',
        roomId: '!r:s',
        kind: 'thread_started',
        unreadCount: 1,
        occurredAt: '2026-04-30T00:00:00.000Z',
        ...overrides,
    });

    it('shows empty state and zero unread total', async () => {
        const fetcher: ThreadActivityFetcher = {
            listActivity: vi.fn(async () => ({ activities: [] })),
            markActivityRead: vi.fn(),
        };
        const { container } = await mount(<ThreadActivityPage fetcher={fetcher} />);
        expect(container.querySelector('[data-testid="thread-activity-empty"]')).toBeTruthy();
        expect(
            container.querySelector('[data-testid="thread-activity-unread-total"]')?.textContent
        ).toContain('0 unread');
    });

    it('renders activities and aggregates the unread total', async () => {
        const fetcher: ThreadActivityFetcher = {
            listActivity: vi.fn(async () => ({
                activities: [
                    activity({ activityId: 'a-1', unreadCount: 3 }),
                    activity({ activityId: 'a-2', unreadCount: 7, kind: 'thread_replied' }),
                ],
            })),
            markActivityRead: vi.fn(),
        };
        const { container } = await mount(<ThreadActivityPage fetcher={fetcher} />);

        expect(container.querySelector('[data-testid="thread-activity-a-1"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="thread-activity-a-2"]')).toBeTruthy();
        expect(
            container.querySelector('[data-testid="thread-activity-unread-total"]')?.textContent
        ).toContain('10 unread');
    });

    it('marks an activity read and removes it optimistically', async () => {
        const fetcher: ThreadActivityFetcher = {
            listActivity: vi.fn(async () => ({
                activities: [activity({ activityId: 'a-1', unreadCount: 3 })],
            })),
            markActivityRead: vi.fn(async () => ({})),
        };
        const { container } = await mount(<ThreadActivityPage fetcher={fetcher} />);

        const button = container.querySelector(
            '[data-testid="thread-activity-mark-read-a-1"]'
        ) as HTMLButtonElement;

        await act(async () => {
            button.click();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(fetcher.markActivityRead).toHaveBeenCalledWith('a-1');
        expect(container.querySelector('[data-testid="thread-activity-a-1"]')).toBeNull();
    });
});
