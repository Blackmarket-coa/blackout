// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import CreatorKits from './CreatorKits';
import { CREATOR_KITS } from '../kits/kitCatalog';

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

describe('CreatorKits', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
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
});
