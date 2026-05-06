// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { NormalizedListing } from '@blackout/core';

const fetchListingDetailMock = vi.fn();
const startCheckoutMock = vi.fn();

vi.mock('../../features/monetization/marketplace/marketplaceClient', () => ({
    fetchListingDetail: (...args: unknown[]) => fetchListingDetailMock(...args),
    fetchListings: vi.fn(),
    fetchProviders: vi.fn(),
    startCheckout: (...args: unknown[]) => startCheckoutMock(...args),
    fetchEntitlements: vi.fn(),
    fetchFulfillmentAsset: vi.fn(),
    fetchFulfillmentBundle: vi.fn(),
}));

vi.mock('../../features/monetization/marketplace/useMarketplaceAuth', () => ({
    readBlackoutApiToken: () => 'test-token',
}));

vi.mock('../../features/monetization/marketplace/EmbeddedCheckoutOverlay', () => ({
    EmbeddedCheckoutOverlay: (props: { sessionId: string }) => (
        <div data-testid="overlay" data-session-id={props.sessionId} />
    ),
}));

import ProductAttachment from './ProductAttachment';

const buildListing = (overrides: Partial<NormalizedListing> = {}): NormalizedListing =>
    ({
        providerId: 'freeblackmarket',
        providerListingId: 'sku-1',
        title: 'Live listing',
        description: '',
        priceCents: 2500,
        currency: 'USD',
        category: 'subscription',
        media: [],
        availability: 'available',
        ...overrides,
    } as unknown as NormalizedListing);

const mountAttachment = async (eventContent: unknown) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<ProductAttachment eventContent={eventContent} />);
        await Promise.resolve();
    });
    return container;
};

describe('ProductAttachment', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        fetchListingDetailMock.mockReset();
        startCheckoutMock.mockReset();
    });

    it('renders nothing for an empty payload', async () => {
        fetchListingDetailMock.mockResolvedValue(buildListing());
        const container = await mountAttachment({});
        expect(container.querySelector('[data-testid="product-attachment-strip"]')).toBeNull();
    });

    it('renders one card per ref with the snapshot label until the live listing arrives', async () => {
        // Hold the promise so the snapshot label is visible during the
        // first paint, then resolve to confirm the live data swaps in.
        let resolveListing!: (listing: NormalizedListing) => void;
        fetchListingDetailMock.mockImplementation(
            () =>
                new Promise<NormalizedListing>((resolve) => {
                    resolveListing = resolve;
                })
        );

        const container = await mountAttachment({
            version: 1,
            listings: [
                {
                    providerId: 'freeblackmarket',
                    listingId: 'abc',
                    label: 'Snapshot title',
                    priceCents: 1000,
                    currency: 'USD',
                },
            ],
        });

        const card = container.querySelector('[data-testid="product-attachment-card"]');
        expect(card).not.toBeNull();
        expect(card?.getAttribute('data-listing-id')).toBe('abc');
        expect(card?.textContent).toContain('Snapshot title');
        expect(card?.textContent).toContain('Loading listing…');

        await act(async () => {
            resolveListing(buildListing({ title: 'Live title', priceCents: 2500 }));
            await Promise.resolve();
        });

        expect(card?.textContent).toContain('Live title');
        expect(card?.textContent).not.toContain('Loading listing…');
    });

    it('starts checkout via the existing client and shows the embedded overlay on success', async () => {
        fetchListingDetailMock.mockResolvedValue(buildListing());
        startCheckoutMock.mockResolvedValue({
            redirectUrl: 'https://example.com/checkout',
            sessionId: 'sess-1',
            embed: true,
        });

        const container = await mountAttachment({
            listings: [{ providerId: 'freeblackmarket', listingId: 'abc' }],
        });

        const button = container.querySelector('button[type="button"]');
        expect(button).not.toBeNull();

        await act(async () => {
            (button as HTMLButtonElement).click();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(startCheckoutMock).toHaveBeenCalledWith(
            expect.objectContaining({
                providerId: 'freeblackmarket',
                listingId: 'abc',
                embed: true,
            }),
            'test-token'
        );

        expect(container.querySelector('[data-testid="overlay"]')).not.toBeNull();
    });
});
