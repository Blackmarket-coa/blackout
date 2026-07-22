// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

// The tab body pulls matrix hooks and room atoms; stub it so this test
// exercises only the page shell + tab routing.
vi.mock('../../../../src/app/features/messaging/MessagingTabBody', () => ({
    MessagingTabBody: ({ tab }: { tab: string }) => (
        <div data-testid="stub-messaging-body" data-tab={tab} />
    ),
}));

import { MessagingPage } from '../../../../src/app/features/messaging/MessagingPage';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};

const mountAt = async (path: string) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    const router = createMemoryRouter([{ path: '*', element: <MessagingPage /> }], {
        initialEntries: [path],
    });
    await act(async () => {
        root.render(<RouterProvider router={router} />);
        await flush();
    });
    return container;
};

describe('MessagingPage', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('renders the header, tab links, and the DMs tab at the hub address', async () => {
        const container = await mountAt('/messages/');
        expect(container.textContent).toContain('Messages');
        expect(
            container.querySelector('[data-testid="messaging-tab-dms"]')?.getAttribute('href')
        ).toBe('/messages/locked-in/');
        expect(
            container
                .querySelector('[data-testid="messaging-tab-notifications"]')
                ?.getAttribute('href')
        ).toBe('/messages/notifications/');
        expect(
            container.querySelector('[data-testid="messaging-tab-invites"]')?.getAttribute('href')
        ).toBe('/messages/invites/');
        expect(
            container.querySelector('[data-testid="stub-messaging-body"]')?.getAttribute('data-tab')
        ).toBe('dms');
    });

    it('activates the notifications tab from its address', async () => {
        const container = await mountAt('/messages/notifications/');
        expect(
            container.querySelector('[data-testid="stub-messaging-body"]')?.getAttribute('data-tab')
        ).toBe('notifications');
        expect(
            container
                .querySelector('[data-testid="messaging-tab-notifications"]')
                ?.getAttribute('aria-current')
        ).toBe('page');
    });

    it('treats the create flow as a locked-in sub-state', async () => {
        const container = await mountAt('/messages/locked-in/create/?userId=@v:s');
        expect(
            container.querySelector('[data-testid="stub-messaging-body"]')?.getAttribute('data-tab')
        ).toBe('create');
    });
});
