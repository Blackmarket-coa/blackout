// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { NormalizedEntitlement } from '@blackout/core';
import { LibraryView } from '../../../../src/app/features/monetization/marketplace/LibraryView';
import type { FulfillmentAsset } from '../../../../src/app/features/monetization/marketplace/marketplaceClient';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function entitlement(overrides: Partial<NormalizedEntitlement> = {}): NormalizedEntitlement {
    return {
        id: 'ent_1',
        userId: 'u',
        providerId: 'freeblackmarket',
        providerListingId: 'list_1',
        sku: null,
        kind: 'software_license',
        status: 'granted',
        grantedAt: '2026-05-30T00:00:00Z',
        expiresAt: null,
        sourceEventId: 'evt_1',
        metadata: {},
        ...overrides,
    };
}

const fullAsset: FulfillmentAsset = {
    entitlementId: 'ent_1',
    providerId: 'freeblackmarket',
    kind: 'software_license',
    signature: 'sig',
    expiresAt: '2026-06-01T00:00:00Z',
    assetUrl: 'https://cdn.example/asset.zip',
    licenseKey: 'LIC-ABC-123',
    activationsUsed: 1,
    activationsMax: 3,
};

function mount(node: React.ReactElement): { container: HTMLDivElement; root: ReactDOM.Root } {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    act(() => {
        root.render(node);
    });
    return { container, root };
}

function clickButtonWithText(container: HTMLElement, text: string): void {
    const button = Array.from(container.querySelectorAll('button')).find((b) =>
        (b.textContent ?? '').includes(text)
    );
    if (!button) throw new Error(`button "${text}" not found`);
    act(() => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

describe('LibraryView', () => {
    it('shows an empty-state message when there are no entitlements', () => {
        const { container, root } = mount(<LibraryView entitlements={[]} providers={[]} />);
        expect(container.textContent).toContain('no purchases yet');
        act(() => root.unmount());
    });

    it('lists owned entitlements grouped by provider with kind/listing/status', () => {
        const { container, root } = mount(
            <LibraryView entitlements={[entitlement()]} providers={[]} fetchAsset={vi.fn()} />
        );
        expect(container.textContent).toContain('software_license');
        expect(container.textContent).toContain('list_1');
        expect(container.textContent).toContain('granted');
        act(() => root.unmount());
    });

    it('retrieves and surfaces the download link, license key, and activations on click', async () => {
        const fetchAsset = vi.fn().mockResolvedValue(fullAsset);
        const { container, root } = mount(
            <LibraryView entitlements={[entitlement()]} providers={[]} fetchAsset={fetchAsset} />
        );

        await act(async () => {
            const button = Array.from(container.querySelectorAll('button')).find((b) =>
                (b.textContent ?? '').includes('Get download')
            );
            button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(fetchAsset).toHaveBeenCalledWith('ent_1');
        const anchor = container.querySelector('a');
        expect(anchor?.getAttribute('href')).toBe('https://cdn.example/asset.zip');
        expect(container.textContent).toContain('LIC-ABC-123');
        expect(container.textContent).toContain('Activations: 1/3');
        act(() => root.unmount());
    });

    it('does not offer a download for non-granted entitlements', () => {
        const { container, root } = mount(
            <LibraryView
                entitlements={[entitlement({ status: 'refunded' })]}
                providers={[]}
                fetchAsset={vi.fn()}
            />
        );
        expect(container.textContent).toContain('refunded');
        expect(container.querySelector('button')).toBeNull();
        act(() => root.unmount());
    });

    it('surfaces a retryable error when retrieval fails', async () => {
        const fetchAsset = vi.fn().mockRejectedValue(new Error('boom'));
        const { container, root } = mount(
            <LibraryView entitlements={[entitlement()]} providers={[]} fetchAsset={fetchAsset} />
        );

        await act(async () => {
            const button = Array.from(container.querySelectorAll('button')).find((b) =>
                (b.textContent ?? '').includes('Get download')
            );
            button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(container.textContent).toContain('Could not retrieve this item');
        clickButtonWithText(container, 'Retry');
        expect(fetchAsset).toHaveBeenCalledTimes(2);
        act(() => root.unmount());
    });
});
