// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

const listStreamsMock = vi.fn();
const fetchMyReferralsMock = vi.fn();
const fetchMyAmbassadorMock = vi.fn();
const listMySubscribersMock = vi.fn();
const fetchMyContentMock = vi.fn();

vi.mock('../../streams', () => ({
    listStreams: (...a: unknown[]) => listStreamsMock(...a),
}));
vi.mock('../../growth', () => ({
    fetchMyReferrals: (...a: unknown[]) => fetchMyReferralsMock(...a),
    fetchMyAmbassador: (...a: unknown[]) => fetchMyAmbassadorMock(...a),
}));
vi.mock('../../monetization/monetizationApi', () => ({
    creatorSubsApi: { listMySubscribers: (...a: unknown[]) => listMySubscribersMock(...a) },
}));
vi.mock('../../monetization/marketplace/useMarketplaceAuth', () => ({
    readBlackoutApiToken: () => 'tok',
}));
vi.mock('../../creators/contentClient', () => ({
    fetchMyContent: (...a: unknown[]) => fetchMyContentMock(...a),
}));

import CreatorHubOverview from './CreatorHubOverview';

const flush = async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
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
        listMySubscribersMock.mockReset();
        fetchMyContentMock.mockReset();
        listStreamsMock.mockResolvedValue({ items: [] });
        fetchMyReferralsMock.mockResolvedValue({ items: [] });
        fetchMyAmbassadorMock.mockResolvedValue({ ambassador: null });
        listMySubscribersMock.mockResolvedValue({ subscriptions: [] });
        fetchMyContentMock.mockResolvedValue({ content: [] });
    });

    it('renders the overview grid with external deep-links', async () => {
        const { container } = await mount();
        expect(container.querySelector('[data-testid="creator-hub-overview-grid"]')).not.toBeNull();
        const dashboard = container.querySelector('[data-testid="creator-hub-overview-dashboard"]');
        expect(dashboard?.getAttribute('href')).toBe('/creator');
    });

    it('surfaces active-subscriber and published-content metrics on the cards', async () => {
        listMySubscribersMock.mockResolvedValue({
            subscriptions: [
                { status: 'active' },
                { status: 'active' },
                { status: 'canceled' },
            ],
        });
        fetchMyContentMock.mockResolvedValue({ content: [{}, {}, {}] });
        const { container } = await mount();
        const earnings = container.querySelector('[data-testid="creator-hub-overview-earnings"]');
        const dashboard = container.querySelector('[data-testid="creator-hub-overview-dashboard"]');
        expect(earnings?.textContent).toContain('2 active subscribers');
        expect(dashboard?.textContent).toContain('3 published');
        expect(fetchMyContentMock).toHaveBeenCalledWith('published', 'tok');
    });

    it('falls back to static copy when metrics are empty', async () => {
        const { container } = await mount();
        const earnings = container.querySelector('[data-testid="creator-hub-overview-earnings"]');
        expect(earnings?.textContent).toContain('Subscriptions, tips & payouts');
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
