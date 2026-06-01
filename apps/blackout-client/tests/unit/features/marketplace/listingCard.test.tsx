// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { NormalizedListing } from '@blackout/core';
import { ListingCard } from '../../../../src/app/features/monetization/marketplace/ListingCard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function listing(overrides: Partial<NormalizedListing> = {}): NormalizedListing {
    return {
        providerId: 'freeblackmarket',
        providerListingId: 'list_1',
        category: 'plugin-curated',
        title: 'Heirloom seeds',
        description: 'A bundle of open-pollinated seeds.',
        priceCents: 600,
        currency: 'USD',
        sellerId: 'vendor-acme',
        sellerDisplayName: 'Acme Farms',
        mediaUrls: [],
        entitlementKind: 'asset_bundle',
        ...overrides,
    };
}

function mount(node: React.ReactElement): { container: HTMLDivElement; root: ReactDOM.Root } {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    act(() => {
        root.render(node);
    });
    return { container, root };
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll('button')).find((b) =>
        (b.textContent ?? '').includes(text)
    );
}

describe('ListingCard message-vendor entrypoint', () => {
    it('offers "Message vendor" when a handler and sellerId are present, and calls it', () => {
        const onMessageVendor = vi.fn();
        const { container, root } = mount(
            <ListingCard
                listing={listing()}
                providers={[]}
                onPurchase={vi.fn()}
                onMessageVendor={onMessageVendor}
            />
        );
        const button = findButton(container, 'Message vendor');
        expect(button).toBeTruthy();
        act(() => {
            button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(onMessageVendor).toHaveBeenCalledTimes(1);
        expect(onMessageVendor.mock.calls[0][0].sellerId).toBe('vendor-acme');
        act(() => root.unmount());
    });

    it('hides the entrypoint when the listing has no sellerId', () => {
        const { container, root } = mount(
            <ListingCard
                listing={listing({ sellerId: null })}
                providers={[]}
                onPurchase={vi.fn()}
                onMessageVendor={vi.fn()}
            />
        );
        expect(findButton(container, 'Message vendor')).toBeUndefined();
        act(() => root.unmount());
    });

    it('hides the entrypoint when no handler is provided', () => {
        const { container, root } = mount(
            <ListingCard listing={listing()} providers={[]} onPurchase={vi.fn()} />
        );
        expect(findButton(container, 'Message vendor')).toBeUndefined();
        // The purchase button is still rendered.
        expect(findButton(container, 'Purchase')).toBeTruthy();
        act(() => root.unmount());
    });
});
