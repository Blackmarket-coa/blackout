// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { CreatorContent } from '@blackout/core';

import { CreatorContentRail } from './CreatorContentRail';

const flush = async () => {
    for (let i = 0; i < 8; i++) {
        await Promise.resolve();
    }
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

const content = (over: Partial<CreatorContent> = {}): CreatorContent => ({
    id: 'c1',
    creatorId: '@creator:bmc',
    kind: 'article',
    title: 'Composting 101',
    status: 'published',
    createdAt: '2026-06-03T00:00:00.000Z',
    updatedAt: '2026-06-03T00:00:00.000Z',
    publishedAt: '2026-06-03T00:00:00.000Z',
    ...over,
});

describe('CreatorContentRail', () => {
    it('renders nothing when there is no content', async () => {
        const container = await render(React.createElement(CreatorContentRail, { items: [] }));
        expect(container.querySelector('[data-testid="home-creator-content-rail"]')).toBeNull();
    });

    it('renders a card per published item with its kind', async () => {
        const container = await render(
            React.createElement(CreatorContentRail, {
                items: [content(), content({ id: 'c2', kind: 'video', title: 'Quail vs chickens' })],
            }),
        );
        const cards = container.querySelectorAll('[data-testid="home-creator-content-card"]');
        expect(cards.length).toBe(2);
        expect(cards[1]?.getAttribute('data-content-kind')).toBe('video');
    });
});
