// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

const listStreamsMock = vi.fn();
const fetchMyReferralsMock = vi.fn();
const fetchMyAmbassadorMock = vi.fn();

vi.mock('../../streams', () => ({
    listStreams: (...a: unknown[]) => listStreamsMock(...a),
}));
vi.mock('../../growth', () => ({
    fetchMyReferrals: (...a: unknown[]) => fetchMyReferralsMock(...a),
    fetchMyAmbassador: (...a: unknown[]) => fetchMyAmbassadorMock(...a),
}));

import CreatorHubOverview from './CreatorHubOverview';

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

const mount = async (onSelectTab = vi.fn()) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    const router = createMemoryRouter(
        [{ path: '/streaming', element: <CreatorHubOverview onSelectTab={onSelectTab} /> }],
        { initialEntries: ['/streaming'] }
    );
    await act(async () => {
        root.render(<RouterProvider router={router} />);
        await flush();
    });
    return { container, onSelectTab };
};

describe('CreatorHubOverview', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        listStreamsMock.mockReset();
        fetchMyReferralsMock.mockReset();
        fetchMyAmbassadorMock.mockReset();
        listStreamsMock.mockResolvedValue({ items: [] });
        fetchMyReferralsMock.mockResolvedValue({ items: [] });
        fetchMyAmbassadorMock.mockResolvedValue({ ambassador: null });
    });

    it('renders the overview grid with external deep-links', async () => {
        const { container } = await mount();
        expect(container.querySelector('[data-testid="creator-hub-overview-grid"]')).not.toBeNull();
        const dashboard = container.querySelector('[data-testid="creator-hub-overview-dashboard"]');
        expect(dashboard?.getAttribute('href')).toBe('/creator');
    });

    it('fires onSelectTab for in-hub jumps (clips)', async () => {
        const { container, onSelectTab } = await mount();
        const clips = container.querySelector<HTMLButtonElement>(
            '[data-testid="creator-hub-overview-clips"]'
        );
        await act(async () => {
            clips?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
        });
        expect(onSelectTab).toHaveBeenCalledWith('clips');
    });
});
