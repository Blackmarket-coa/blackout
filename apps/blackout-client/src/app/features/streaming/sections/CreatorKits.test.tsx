// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';

// Replace the orchestrator (which pulls in matrix-js-sdk + many clients) with
// a controllable stub, and the Matrix-client hook so the panel's gating and
// apply flow can be driven from the test.
const applyCreatorKitMock = vi.fn();
let matrixClientMock: { getSafeUserId: () => string } | null = null;
vi.mock('../kits/applyKit', () => ({
    applyCreatorKit: (...args: unknown[]) => applyCreatorKitMock(...args),
    kitAppliedStorageKey: (id: string) => `bmc-creator-kit-applied:${id}`,
}));
vi.mock('../../../hooks/useMatrixClient', () => ({
    useMatrixClientOrNull: () => matrixClientMock,
}));

import CreatorKits from './CreatorKits';
import { CREATOR_KITS } from '../kits/kitCatalog';

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

const mount = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    const router = createMemoryRouter([{ path: '/streaming', element: <CreatorKits /> }], {
        initialEntries: ['/streaming'],
    });
    await act(async () => {
        root.render(<RouterProvider router={router} />);
        await Promise.resolve();
    });
    return { container };
};

const click = async (container: HTMLElement, selector: string) => {
    const el = container.querySelector<HTMLElement>(selector);
    await act(async () => {
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await flush();
    });
};

describe('CreatorKits', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        applyCreatorKitMock.mockReset();
        matrixClientMock = null;
        try {
            localStorage.clear();
        } catch {
            /* ignore */
        }
    });

    it('renders a card for every kit in the catalog', async () => {
        const { container } = await mount();
        const cards = Array.from(container.querySelectorAll('[data-testid="creator-kit-card"]'));
        expect(cards.length).toBe(CREATOR_KITS.length);
    });

    it('shows the detail panel with deep-links for the selected kit', async () => {
        const { container } = await mount();
        // First kit is selected by default.
        const detail = container.querySelector('[data-testid="creator-kit-detail"]');
        expect(detail).not.toBeNull();
        expect(detail?.getAttribute('data-kit-id')).toBe(CREATOR_KITS[0]?.id);
        const links = container.querySelectorAll('[data-testid="creator-kit-deeplink"]');
        expect(links.length).toBeGreaterThan(0);
    });

    it('switches the detail panel when another kit is selected', async () => {
        const { container } = await mount();
        const second = CREATOR_KITS[1];
        const card = container.querySelector<HTMLButtonElement>(
            `[data-testid="creator-kit-card"][data-kit-id="${second.id}"]`
        );
        await act(async () => {
            card?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });
        const detail = container.querySelector('[data-testid="creator-kit-detail"]');
        expect(detail?.getAttribute('data-kit-id')).toBe(second.id);
    });

    it('disables apply when no Matrix client is available', async () => {
        matrixClientMock = null;
        const { container } = await mount();
        const apply = container.querySelector<HTMLButtonElement>(
            '[data-testid="creator-kit-apply"]'
        );
        expect(apply).not.toBeNull();
        expect(apply?.disabled).toBe(true);
    });

    it('confirms then applies the kit and renders per-step results', async () => {
        matrixClientMock = { getSafeUserId: () => '@me:server' };
        applyCreatorKitMock.mockResolvedValue([
            { area: 'den', label: 'Q&A', status: 'ok' },
            { area: 'tier', label: 'Course access', status: 'skipped' },
        ]);
        const { container } = await mount();

        await click(container, '[data-testid="creator-kit-apply"]');
        expect(
            container.querySelector('[data-testid="creator-kit-apply-confirm-panel"]')
        ).not.toBeNull();

        await click(container, '[data-testid="creator-kit-apply-confirm"]');

        expect(applyCreatorKitMock).toHaveBeenCalledWith(
            CREATOR_KITS[0],
            expect.objectContaining({ userId: '@me:server' })
        );
        const results = container.querySelector('[data-testid="creator-kit-apply-results"]');
        expect(results).not.toBeNull();
        const rows = Array.from(results?.querySelectorAll('li') ?? []);
        expect(rows.map((r) => r.getAttribute('data-step-status'))).toEqual(['ok', 'skipped']);
    });
});
