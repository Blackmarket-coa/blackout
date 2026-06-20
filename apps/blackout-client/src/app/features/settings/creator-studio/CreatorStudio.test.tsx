// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

const fetchCreatorProvidersMock = vi.fn();
const fetchMyListingsMock = vi.fn();
const createListingMock = vi.fn();
const publishListingMock = vi.fn();
const archiveListingMock = vi.fn();
const startPayoutOnboardingMock = vi.fn();

vi.mock('./creatorClient', () => ({
    fetchCreatorProviders: (...a: unknown[]) => fetchCreatorProvidersMock(...a),
    fetchMyListings: (...a: unknown[]) => fetchMyListingsMock(...a),
    createListing: (...a: unknown[]) => createListingMock(...a),
    publishListing: (...a: unknown[]) => publishListingMock(...a),
    archiveListing: (...a: unknown[]) => archiveListingMock(...a),
    startPayoutOnboarding: (...a: unknown[]) => startPayoutOnboardingMock(...a),
}));

vi.mock('../../monetization/marketplace/useMarketplaceAuth', () => ({
    readBlackoutApiToken: () => 'test-token',
}));

import { CreatorStudio } from './CreatorStudio';

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};

const mount = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<CreatorStudio />);
        await flush();
    });
    return container;
};

const setInputValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const proto =
        el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
};

const clickByText = (container: HTMLElement, text: string) => {
    const btn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === text
    );
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

describe('CreatorStudio', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        fetchCreatorProvidersMock.mockReset();
        fetchMyListingsMock.mockReset();
        createListingMock.mockReset();
        publishListingMock.mockReset();
        archiveListingMock.mockReset();
        startPayoutOnboardingMock.mockReset();
        fetchCreatorProvidersMock.mockResolvedValue([
            {
                id: 'freeblackmarket',
                displayName: 'FreeBlackMarket',
                capabilities: ['creator-write'],
            },
        ]);
        fetchMyListingsMock.mockResolvedValue([]);
    });

    it('renders the artifact tabs and the provider select', async () => {
        const container = await mount();
        const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
        expect(tabs.length).toBeGreaterThan(10);
        expect(container.querySelector('select')).not.toBeNull();
    });

    it('creates a listing with a derived category/entitlement and no placeholder payload', async () => {
        createListingMock.mockResolvedValue({ id: 'L1', status: 'draft', title: 'Theme' });
        const container = await mount();

        // Default tab is "theme"; fill the title and submit.
        const title = container.querySelector<HTMLInputElement>('input[type="text"]');
        expect(title).not.toBeNull();
        await act(async () => {
            setInputValue(title!, 'My theme');
            await flush();
        });
        await act(async () => {
            clickByText(container, 'Create draft listing');
            await flush();
        });

        expect(createListingMock).toHaveBeenCalledTimes(1);
        const body = createListingMock.mock.calls[0][0];
        expect(body).toMatchObject({
            artifactKind: 'theme',
            category: 'plugin-curated',
            entitlementKind: 'plugin_flag',
            title: 'My theme',
        });
        // Clean empty payload, not the old `{ placeholder: true }` sentinel.
        expect(body.artifactPayload).toEqual({});
    });

    it('rejects invalid JSON payloads without calling createListing', async () => {
        const container = await mount();
        const title = container.querySelector<HTMLInputElement>('input[type="text"]');
        const payload = container.querySelector<HTMLTextAreaElement>('textarea[placeholder]');
        await act(async () => {
            setInputValue(title!, 'Bad JSON theme');
            setInputValue(payload!, '{ not valid json');
            await flush();
        });
        await act(async () => {
            clickByText(container, 'Create draft listing');
            await flush();
        });
        expect(createListingMock).not.toHaveBeenCalled();
        expect(container.textContent).toContain('Artifact payload must be valid JSON.');
    });

    it('disables Publish for already-published listings on the listings tab', async () => {
        fetchMyListingsMock.mockResolvedValue([
            {
                id: 'P1',
                providerId: 'freeblackmarket',
                providerListingId: 'pid',
                artifactKind: 'theme',
                category: 'plugin-curated',
                entitlementKind: 'plugin_flag',
                title: 'Published theme',
                description: '',
                priceCents: 0,
                currency: 'USD',
                status: 'published',
                publicSlug: 'pub',
                publishedAt: '2025-01-01T00:00:00Z',
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z',
            },
        ]);
        const container = await mount();
        await act(async () => {
            clickByText(container, 'My listings');
            await flush();
        });
        const publishBtn = Array.from(container.querySelectorAll('button')).find(
            (b) => b.textContent?.trim() === 'Publish'
        );
        expect(publishBtn?.disabled).toBe(true);
    });

    it('starts payout onboarding from the payouts tab', async () => {
        startPayoutOnboardingMock.mockResolvedValue({
            onboardingUrl: 'https://example.test/onboard',
            expiresAt: '2025-01-01T00:00:00Z',
        });
        const container = await mount();
        await act(async () => {
            clickByText(container, 'Payouts');
            await flush();
        });
        await act(async () => {
            clickByText(container, 'Start payout onboarding');
            await flush();
        });
        expect(startPayoutOnboardingMock).toHaveBeenCalledTimes(1);
        expect(container.textContent).toContain('open in browser');
    });
});
