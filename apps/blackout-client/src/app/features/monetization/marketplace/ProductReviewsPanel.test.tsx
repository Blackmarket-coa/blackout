// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { ProductReview } from '@blackout/core';

const fetchProductReviews = vi.fn();
const fetchProductVersions = vi.fn();
const postProductReview = vi.fn();
vi.mock('./productReviewsClient', () => ({
    fetchProductReviews: (...a: unknown[]) => fetchProductReviews(...a),
    fetchProductVersions: (...a: unknown[]) => fetchProductVersions(...a),
    postProductReview: (...a: unknown[]) => postProductReview(...a),
}));

import { ProductReviewsPanel } from './ProductReviewsPanel';

const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

const render = async (node: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(node);
        await flush();
    });
    return container;
};

const review = (over: Partial<ProductReview> = {}): ProductReview => ({
    id: 'r1',
    providerId: 'freeblackmarket',
    listingId: 'l1',
    authorId: '@alice:bmc',
    rating: 4,
    createdAt: '2026-06-03T00:00:00.000Z',
    updatedAt: '2026-06-03T00:00:00.000Z',
    ...over,
});

describe('ProductReviewsPanel', () => {
    beforeEach(() => {
        fetchProductReviews.mockReset();
        fetchProductVersions.mockReset();
        postProductReview.mockReset();
    });

    it('renders the rating summary and one row per review', async () => {
        fetchProductReviews.mockResolvedValue({
            reviews: [review(), review({ id: 'r2', authorId: '@bob:bmc', rating: 2 })],
            summary: { providerId: 'freeblackmarket', listingId: 'l1', count: 2, average: 3 },
        });
        fetchProductVersions.mockResolvedValue({ versions: [] });

        const container = await render(
            React.createElement(ProductReviewsPanel, {
                providerId: 'freeblackmarket',
                listingId: 'l1',
            }),
        );
        const rows = container.querySelectorAll('[data-testid="product-review"]');
        expect(rows.length).toBe(2);
        expect(container.textContent).toContain('3.0 ★');
        expect(container.textContent).toContain('2 reviews');
    });
});
