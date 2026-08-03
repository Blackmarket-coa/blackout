// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';

const fetchCreatorProvidersMock = vi.fn();
const createCreatorListingMock = vi.fn();
const publishCreatorListingMock = vi.fn();
const startCreatorPayoutOnboardingMock = vi.fn();

vi.mock('../creatorClient', () => ({
    fetchCreatorProviders: (...a: unknown[]) => fetchCreatorProvidersMock(...a),
    createCreatorListing: (...a: unknown[]) => createCreatorListingMock(...a),
    publishCreatorListing: (...a: unknown[]) => publishCreatorListingMock(...a),
    startCreatorPayoutOnboarding: (...a: unknown[]) => startCreatorPayoutOnboardingMock(...a),
}));

// Stub the media uploader so the wizard doesn't reach for a Matrix client.
vi.mock('./MediaUploadField', () => ({
    MediaUploadField: () => null,
    default: () => null,
}));

import { SellProductWizard } from './SellProductWizard';

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

const click = (el: Element | null) => el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

const setInputValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const proto =
        el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
};

const mount = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(<SellProductWizard />);
        await flush();
    });
    return container;
};

describe('SellProductWizard', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        fetchCreatorProvidersMock.mockReset();
        createCreatorListingMock.mockReset();
        publishCreatorListingMock.mockReset();
        startCreatorPayoutOnboardingMock.mockReset();
        fetchCreatorProvidersMock.mockResolvedValue({
            providers: [
                {
                    id: 'freeblackmarket',
                    displayName: 'Free Black Market',
                    capabilities: ['creator-write'],
                },
            ],
        });
    });

    it('offers both a digital-download and blackout-feature templates', async () => {
        const container = await mount();
        expect(
            container.querySelector('[data-testid="sell-template-digital_download"]')
        ).not.toBeNull();
        expect(container.querySelector('[data-testid="sell-template-theme"]')).not.toBeNull();
        expect(
            container.querySelector('[data-testid="sell-template-privacy_tool"]')
        ).not.toBeNull();
    });

    it('walks a digital download through create with the derived vault_item mapping', async () => {
        createCreatorListingMock.mockResolvedValue({
            listing: {
                id: 'L1',
                providerId: 'freeblackmarket',
                providerListingId: 'P1',
                artifactKind: 'vault_item',
                category: 'security-tool',
                entitlementKind: 'vault_item',
                title: 'Field Guide',
                description: 'A guide',
                priceCents: 499,
                currency: 'USD',
                status: 'draft',
                publicSlug: null,
                publishedAt: null,
                createdAt: '',
                updatedAt: '',
            },
        });
        const container = await mount();

        // Choose the digital-download template → details step.
        await act(async () => {
            click(container.querySelector('[data-testid="sell-template-digital_download"]'));
            await flush();
        });
        const title = container.querySelector<HTMLInputElement>('[data-testid="sell-title"]');
        const description = container.querySelector<HTMLTextAreaElement>(
            '[data-testid="sell-description"]'
        );
        expect(title).not.toBeNull();
        await act(async () => {
            if (title) setInputValue(title, 'Field Guide');
            if (description) setInputValue(description, 'A guide');
            await flush();
        });

        // details → artifact → media → review
        for (let i = 0; i < 3; i += 1) {
            await act(async () => {
                click(container.querySelector('[data-testid="sell-next"]'));
                await flush();
            });
        }

        await act(async () => {
            click(container.querySelector('[data-testid="sell-create"]'));
            await flush();
        });

        expect(createCreatorListingMock).toHaveBeenCalledTimes(1);
        expect(createCreatorListingMock.mock.calls[0][0]).toMatchObject({
            providerId: 'freeblackmarket',
            artifactKind: 'vault_item',
            category: 'security-tool',
            entitlementKind: 'vault_item',
            title: 'Field Guide',
            description: 'A guide',
            artifactPayload: { files: [] },
        });
        // Post-create the Publish CTA appears.
        expect(container.querySelector('[data-testid="sell-publish"]')).not.toBeNull();
    });
});
