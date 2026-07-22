// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

const fetchListingDetailMock = vi.fn();
const fetchProvidersMock = vi.fn();
const fetchEntitlementsMock = vi.fn();

vi.mock('../../../../src/app/features/monetization/marketplace/marketplaceClient', () => ({
    fetchListingDetail: (...args: unknown[]) => fetchListingDetailMock(...args),
    fetchProviders: (...args: unknown[]) => fetchProvidersMock(...args),
    fetchEntitlements: (...args: unknown[]) => fetchEntitlementsMock(...args),
    fetchVendorMatrixId: vi.fn(),
    startCheckout: vi.fn(),
}));

vi.mock('../../../../src/app/features/monetization/marketplace/useMarketplaceAuth', () => ({
    readBlackoutApiToken: () => 'test-token',
}));

vi.mock('../../../../src/client/blackoutApiSession', () => ({
    ensureBlackoutApiToken: vi.fn().mockResolvedValue('test-token'),
}));

import { ListingDetailSlice } from '../../../../src/app/features/monetization/marketplace/ListingDetailSlice';
import { MARKET_LISTING_PATH, buildMarketListingPath } from '../../../../src/app/pages/paths';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};

const LISTING = {
    providerId: 'freeblackmarket',
    providerListingId: 'listing-1',
    category: 'stego-software',
    title: 'Signal Cloak',
    description: 'Steganographic channel toolkit.',
    priceCents: 1999,
    currency: 'usd',
    sellerId: 'vendor-1',
    mediaUrls: [],
    entitlementKind: 'download',
    tags: ['stego'],
};

const mountDetail = async (providerId: string, listingId: string) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    const router = createMemoryRouter(
        [{ path: MARKET_LISTING_PATH, element: <ListingDetailSlice /> }],
        { initialEntries: [buildMarketListingPath(providerId, listingId)] }
    );
    await act(async () => {
        root.render(<RouterProvider router={router} />);
        await flush();
    });
    return container;
};

describe('ListingDetailSlice', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        fetchListingDetailMock.mockReset();
        fetchProvidersMock.mockReset();
        fetchEntitlementsMock.mockReset();
        fetchProvidersMock.mockResolvedValue([]);
        fetchEntitlementsMock.mockResolvedValue([]);
    });

    it('renders the listing title, price, and purchase affordance', async () => {
        fetchListingDetailMock.mockResolvedValue(LISTING);
        const container = await mountDetail('freeblackmarket', 'listing-1');

        expect(fetchListingDetailMock).toHaveBeenCalledWith(
            'freeblackmarket',
            'listing-1',
            'test-token'
        );
        expect(container.querySelector('[data-testid="market-listing-detail"]')).not.toBeNull();
        expect(container.textContent).toContain('Signal Cloak');
        expect(container.textContent).toContain('19.99 USD');
        expect(container.querySelector('[data-testid="market-listing-purchase"]')).not.toBeNull();
        expect(
            container.querySelector('[data-testid="market-listing-message-vendor"]')
        ).not.toBeNull();
    });

    it('marks the listing as owned when a granted entitlement matches', async () => {
        fetchListingDetailMock.mockResolvedValue(LISTING);
        fetchEntitlementsMock.mockResolvedValue([
            {
                providerId: 'freeblackmarket',
                providerListingId: 'listing-1',
                status: 'granted',
            },
        ]);
        const container = await mountDetail('freeblackmarket', 'listing-1');
        const purchase = container.querySelector<HTMLButtonElement>(
            '[data-testid="market-listing-purchase"]'
        );
        expect(purchase?.textContent).toBe('Owned');
        expect(purchase?.disabled).toBe(true);
    });

    it('renders the not-found state on a 404', async () => {
        fetchListingDetailMock.mockRejectedValue(
            Object.assign(new Error('listing_not_found'), { status: 404 })
        );
        const container = await mountDetail('freeblackmarket', 'gone');
        expect(container.querySelector('[data-testid="market-listing-not-found"]')).not.toBeNull();
        expect(container.querySelector('a')?.getAttribute('href')).toBe('/market');
    });

    it('renders the error state with a back link on other failures', async () => {
        fetchListingDetailMock.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
        const container = await mountDetail('freeblackmarket', 'listing-1');
        expect(container.querySelector('[data-testid="market-listing-error"]')).not.toBeNull();
        expect(container.querySelector('a')?.getAttribute('href')).toBe('/market');
    });
});
