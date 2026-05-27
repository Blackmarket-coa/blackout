// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

const fetchCreatorProvidersMock = vi.fn();
const fetchMyCreatorListingsMock = vi.fn();
const publishCreatorListingMock = vi.fn();
const archiveCreatorListingMock = vi.fn();
const startCreatorPayoutOnboardingMock = vi.fn();

vi.mock('./creatorClient', () => ({
    fetchCreatorProviders: (...a: unknown[]) => fetchCreatorProvidersMock(...a),
    fetchMyCreatorListings: (...a: unknown[]) => fetchMyCreatorListingsMock(...a),
    createCreatorListing: vi.fn(),
    publishCreatorListing: (...a: unknown[]) => publishCreatorListingMock(...a),
    archiveCreatorListing: (...a: unknown[]) => archiveCreatorListingMock(...a),
    startCreatorPayoutOnboarding: (...a: unknown[]) => startCreatorPayoutOnboardingMock(...a),
}));

import CreatorListings from './CreatorListings';
import { ConfirmProvider } from '../../components/confirm-dialog';

const flush = async () => {
    // Two ticks: the initial Promise.all + state-set re-render.
    await Promise.resolve();
    await Promise.resolve();
};

const mountPage = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        // CreatorListings calls useConfirm(), which requires a ConfirmProvider
        // ancestor.
        root.render(
            <ConfirmProvider>
                <CreatorListings />
            </ConfirmProvider>
        );
        await flush();
    });
    return container;
};

describe('CreatorListings', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        fetchCreatorProvidersMock.mockReset();
        fetchMyCreatorListingsMock.mockReset();
        publishCreatorListingMock.mockReset();
        archiveCreatorListingMock.mockReset();
        startCreatorPayoutOnboardingMock.mockReset();
    });

    it('shows an empty state and the onboarding card when no listings exist yet', async () => {
        fetchCreatorProvidersMock.mockResolvedValue({
            providers: [
                { id: 'fbm', displayName: 'FreeBlackMarket', capabilities: ['creator-write'] },
            ],
        });
        fetchMyCreatorListingsMock.mockResolvedValue({ listings: [] });

        const container = await mountPage();

        expect(container.querySelector('[data-testid="creator-onboarding-card"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="creator-listings-empty"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="creator-listings-list"]')).toBeNull();
    });

    it('renders one card per listing and exposes status-conditional Publish/Archive controls', async () => {
        fetchCreatorProvidersMock.mockResolvedValue({ providers: [] });
        fetchMyCreatorListingsMock.mockResolvedValue({
            listings: [
                {
                    id: 'L1',
                    providerId: 'fbm',
                    providerListingId: 'P1',
                    artifactKind: 'asset_bundle',
                    category: 'meme-asset',
                    entitlementKind: 'asset_bundle',
                    title: 'Aid bundle',
                    description: '',
                    priceCents: 500,
                    currency: 'USD',
                    status: 'draft',
                    publicSlug: null,
                    publishedAt: null,
                    createdAt: '2025-01-01T00:00:00Z',
                    updatedAt: '2025-01-01T00:00:00Z',
                },
                {
                    id: 'L2',
                    providerId: 'fbm',
                    providerListingId: 'P2',
                    artifactKind: 'asset_bundle',
                    category: 'subscription',
                    entitlementKind: 'subscription_tier',
                    title: 'Pro subscription',
                    description: '',
                    priceCents: 1500,
                    currency: 'USD',
                    status: 'published',
                    publicSlug: 'pro',
                    publishedAt: '2025-02-01T00:00:00Z',
                    createdAt: '2025-01-01T00:00:00Z',
                    updatedAt: '2025-02-01T00:00:00Z',
                },
            ],
        });

        const container = await mountPage();

        const cards = Array.from(
            container.querySelectorAll('[data-testid="creator-listing-card"]')
        );
        expect(cards.map((c) => c.getAttribute('data-listing-id'))).toEqual(['L1', 'L2']);

        const draftCard = container.querySelector(
            '[data-testid="creator-listing-card"][data-listing-id="L1"]'
        );
        // Draft listings expose Publish + Archive (2 buttons).
        expect(draftCard?.querySelectorAll('button').length).toBe(2);

        const publishedCard = container.querySelector(
            '[data-testid="creator-listing-card"][data-listing-id="L2"]'
        );
        // Published listings expose only Archive (1 button).
        expect(publishedCard?.querySelectorAll('button').length).toBe(1);
    });

    it('shows the API error in a banner when loading fails', async () => {
        fetchCreatorProvidersMock.mockRejectedValue(new Error('forbidden'));
        fetchMyCreatorListingsMock.mockRejectedValue(new Error('forbidden'));
        const container = await mountPage();
        expect(container.textContent).toContain('forbidden');
    });
});
