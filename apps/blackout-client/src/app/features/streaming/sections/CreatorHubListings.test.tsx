// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';

const fetchCreatorProvidersMock = vi.fn();
const fetchMyCreatorListingsMock = vi.fn();

// The section pulls in the creator client (monetization-backed); stub it so the
// test exercises the section wiring without network.
vi.mock('../../creators/creatorClient', () => ({
    fetchCreatorProviders: (...a: unknown[]) => fetchCreatorProvidersMock(...a),
    fetchMyCreatorListings: (...a: unknown[]) => fetchMyCreatorListingsMock(...a),
    createCreatorListing: vi.fn(),
    publishCreatorListing: vi.fn(),
    archiveCreatorListing: vi.fn(),
    startCreatorPayoutOnboarding: vi.fn(),
}));

import { CreatorHubListings } from './CreatorHubListings';
import { ConfirmProvider } from '../../../components/confirm-dialog';

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

describe('CreatorHubListings', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        fetchCreatorProvidersMock.mockReset();
        fetchMyCreatorListingsMock.mockReset();
    });

    it('mounts the creator listings surface with its composer toggle', async () => {
        fetchCreatorProvidersMock.mockResolvedValue({ providers: [] });
        fetchMyCreatorListingsMock.mockResolvedValue({ listings: [] });

        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        // The section renders react-router `Link`s, so it needs router context
        // — same harness as the sibling CreatorHubOverview test.
        const router = createMemoryRouter(
            [
                {
                    path: '/streaming',
                    element: (
                        <ConfirmProvider>
                            <CreatorHubListings />
                        </ConfirmProvider>
                    ),
                },
            ],
            { initialEntries: ['/streaming'] }
        );
        await act(async () => {
            root.render(<RouterProvider router={router} />);
            await flush();
        });

        expect(container.querySelector('[data-shell-region="creator-listings"]')).not.toBeNull();
        expect(
            container.querySelector('[data-testid="creator-listing-new-toggle"]')
        ).not.toBeNull();
    });
});
