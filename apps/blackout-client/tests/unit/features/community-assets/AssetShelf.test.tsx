// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchAssets = vi.fn();
const fetchMyAssets = vi.fn();
const submitAsset = vi.fn();
vi.mock('../../../../src/app/features/community-assets/assetsClient', () => ({
    fetchAssets: (...a: unknown[]) => fetchAssets(...a),
    fetchMyAssets: (...a: unknown[]) => fetchMyAssets(...a),
    submitAsset: (...a: unknown[]) => submitAsset(...a),
}));

const { default: AssetShelf } = await import(
    '../../../../src/app/features/community-assets/AssetShelf'
);

const asset = (overrides: Record<string, unknown> = {}) => ({
    id: 'a1',
    creatorId: '@me:s',
    kind: 'sticker',
    name: 'Compost bin',
    description: null,
    mediaUrl: 'mxc://x',
    status: 'approved',
    reviewNote: null,
    foundingOrdinal: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
});

const mount = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
        ReactDOM.createRoot(container).render(<AssetShelf />);
        await Promise.resolve();
        await Promise.resolve();
    });
    return container;
};

beforeEach(() => {
    document.body.innerHTML = '';
    fetchAssets.mockReset().mockResolvedValue([]);
    fetchMyAssets.mockReset().mockResolvedValue([]);
    submitAsset.mockReset().mockResolvedValue({ asset: asset(), shareable: false });
});

describe('AssetShelf', () => {
    it('warns that submissions are reviewed before they can be shared', async () => {
        const container = await mount();
        // Said before submitting, so nobody expects an upload to appear at once.
        expect(container.textContent).toContain('reviewed before they can be shared');
    });

    it('says the shelf is empty rather than looking broken', async () => {
        const container = await mount();
        expect(container.querySelector('[data-testid="asset-shelf-empty"]')).not.toBeNull();
    });

    it('shows approved work on the shelf', async () => {
        fetchAssets.mockResolvedValue([asset({ name: 'Sunflower', description: 'A sticker' })]);
        const container = await mount();
        expect(container.textContent).toContain('Sunflower');
        expect(container.querySelector('[data-testid="asset-shelf-empty"]')).toBeNull();
    });

    it('shows a creator their pending work in plain words, with any rejection reason', async () => {
        fetchMyAssets.mockResolvedValue([
            asset({ id: 'p1', name: 'Pending one', status: 'pending' }),
            asset({
                id: 'r1',
                name: 'Rejected one',
                status: 'rejected',
                reviewNote: 'Reuses someone else’s artwork',
            }),
        ]);
        const container = await mount();
        const text = container.textContent ?? '';
        expect(text).toContain('In review — not shared with anyone yet');
        expect(text).toContain('Not approved');
        // A rejection the creator can actually answer.
        expect(text).toContain('Reuses someone else’s artwork');
    });

    it('refuses to submit without a name and an image', async () => {
        const container = await mount();
        expect(container.querySelector('[data-testid="asset-submit"]')).toHaveProperty(
            'disabled',
            true
        );
        expect(submitAsset).not.toHaveBeenCalled();
    });

    it('requests the shelf for the selected kind', async () => {
        const container = await mount();
        await act(async () => {
            container
                .querySelector('[data-testid="asset-kind-coin"]')
                ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(fetchAssets).toHaveBeenLastCalledWith('coin');
    });
});
