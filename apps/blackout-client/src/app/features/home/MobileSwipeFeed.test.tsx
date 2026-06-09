// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import type { UnifiedFeedItem } from './unifiedFeedModel';

// Drive the feed contents per-test. The card + item shape are covered by
// UnifiedFeedCard's own tests, so we stub the card and feed the swipe surface
// minimal items to keep this focused on navigation behavior.
let feedResult: {
    following: UnifiedFeedItem[];
    discover: UnifiedFeedItem[];
    liveRail: never[];
    loading: boolean;
    errorsBySource: Record<string, never>;
};
vi.mock('./hooks/useUnifiedFeed', () => ({
    useUnifiedFeed: () => feedResult,
}));
vi.mock('./useReducedMotion', () => ({ useReducedMotion: () => true }));
vi.mock('./UnifiedFeedCard', () => ({
    UnifiedFeedCard: ({ item }: { item: UnifiedFeedItem }) => (
        <div data-testid="mock-card">{item.id}</div>
    ),
}));

import { MobileSwipeFeed } from './MobileSwipeFeed';

const item = (id: string): UnifiedFeedItem => ({ id }) as unknown as UnifiedFeedItem;

const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
};

let container: HTMLDivElement;
let root: ReactDOM.Root;

const render = async (node: React.ReactElement) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(node);
        await flush();
    });
    return container;
};

const fireKey = async (key: string) => {
    const surface = container.querySelector('[data-testid="swipe-feed"]')!;
    await act(async () => {
        surface.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        await flush();
    });
};

const position = () =>
    container.querySelector('[data-testid="swipe-feed-position"]')?.textContent?.trim();

const activeIndex = () => {
    const slides = Array.from(container.querySelectorAll('[data-testid="swipe-feed-slide"]'));
    return slides.findIndex((s) => s.getAttribute('data-active') === 'true');
};

beforeEach(() => {
    feedResult = {
        following: [item('a'), item('b')],
        discover: [item('c'), item('a')], // 'a' is a dup — must be deduped
        liveRail: [],
        loading: false,
        errorsBySource: {},
    };
});

describe('MobileSwipeFeed', () => {
    it('renders one deduped slide per item with a position pill', async () => {
        await render(<MobileSwipeFeed />);
        const slides = container.querySelectorAll('[data-testid="swipe-feed-slide"]');
        expect(slides.length).toBe(3); // a, b, c
        expect(position()).toBe('1 / 3');
        expect(activeIndex()).toBe(0);
    });

    it('advances and rewinds the active slide via keyboard', async () => {
        await render(<MobileSwipeFeed />);
        await fireKey('ArrowDown');
        expect(position()).toBe('2 / 3');
        expect(activeIndex()).toBe(1);
        await fireKey('j');
        expect(position()).toBe('3 / 3');
        await fireKey('ArrowDown'); // clamps at the end
        expect(position()).toBe('3 / 3');
        await fireKey('ArrowUp');
        expect(position()).toBe('2 / 3');
        await fireKey('Home');
        expect(position()).toBe('1 / 3');
        await fireKey('End');
        expect(position()).toBe('3 / 3');
    });

    it('drives navigation from the prev/next buttons with edge disabling', async () => {
        await render(<MobileSwipeFeed />);
        const prev = container.querySelector(
            '[data-testid="swipe-feed-prev"]',
        ) as HTMLButtonElement;
        const next = container.querySelector(
            '[data-testid="swipe-feed-next"]',
        ) as HTMLButtonElement;
        expect(prev.disabled).toBe(true); // at the first slide
        expect(next.disabled).toBe(false);

        await act(async () => {
            next.click();
            await flush();
        });
        expect(position()).toBe('2 / 3');
        expect(prev.disabled).toBe(false);
    });

    it('shows an empty state when there are no items', async () => {
        feedResult = {
            following: [],
            discover: [],
            liveRail: [],
            loading: false,
            errorsBySource: {},
        };
        await render(<MobileSwipeFeed />);
        expect(container.querySelector('[data-testid="swipe-feed-empty"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="swipe-feed"]')).toBeNull();
    });
});
