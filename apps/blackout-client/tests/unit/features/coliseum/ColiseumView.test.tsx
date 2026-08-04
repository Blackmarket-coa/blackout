// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider, createStore } from 'jotai';
import { coliseumTabAtom } from '../../../../src/app/state/coliseum';
import { ColiseumView } from '../../../../src/app/features/coliseum/ColiseumView';

// Stub every tab so the view test doesn't pull in network hooks / Matrix deps.
// (vi.mock factories are hoisted, so each stub is declared inline.)
vi.mock('../../../../src/app/features/coliseum/tabs/ReelTab', () => ({
    default: () => <div data-testid="stub-reel" />,
}));
vi.mock('../../../../src/app/features/coliseum/tabs/TopicsTab', () => ({
    default: () => <div data-testid="stub-topics" />,
}));
vi.mock('../../../../src/app/features/coliseum/tabs/ChallengesTab', () => ({
    default: () => <div data-testid="stub-challenges" />,
}));
vi.mock('../../../../src/app/features/coliseum/tabs/LeaderboardsTab', () => ({
    default: () => <div data-testid="stub-leaderboards" />,
}));
vi.mock('../../../../src/app/features/coliseum/tabs/KnowledgeTab', () => ({
    default: () => <div data-testid="stub-knowledge" />,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: ReactDOM.Root[] = [];

const renderWith = (store: ReturnType<typeof createStore>, node: React.ReactElement) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    act(() => {
        root.render(<Provider store={store}>{node}</Provider>);
    });
    mountedRoots.push(root);
    return container;
};

const renderView = (store = createStore()) => ({
    container: renderWith(store, <ColiseumView scopeLabel="Standalone" />),
    store,
});

afterEach(() => {
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
    window.localStorage.clear();
    vi.clearAllMocks();
});

describe('ColiseumView', () => {
    it('lands on the For You reel by default', () => {
        const { container } = renderView();
        expect(container.querySelector('[data-testid="stub-reel"]')).toBeTruthy();
        const active = container.querySelector('[role="tab"][aria-selected="true"]');
        expect(active?.getAttribute('data-coliseum-tab')).toBe('reel');
        expect(active?.textContent).toBe('For You');
    });

    it('renders only cross-topic surfaces — no drill-in lives here any more', () => {
        const { container } = renderView();
        // debate / match / arena / shouts / sources / live are sections of
        // TopicPage now, reached by opening the topic that produced them.
        expect(container.querySelector('[data-testid="coliseum-debate-back-bar"]')).toBeNull();
        expect(container.querySelector('[data-testid="coliseum-more-tab"]')).toBeNull();
    });

    /**
     * `bmc-coliseum-tab` persists across releases, so an install that was last
     * on Arena or Debate must not open to a blank body.
     */
    it.each(['debate', 'arena', 'match', 'shouts', 'sources', 'live'] as const)(
        'rewrites a stale %s tab persisted before the consolidation',
        (stale) => {
            const store = createStore();
            store.set(coliseumTabAtom, stale);
            const { container } = renderView(store);
            expect(container.querySelector('[data-testid="stub-topics"]')).toBeTruthy();
            expect(store.get(coliseumTabAtom)).toBe('topics');
        }
    );

    it('keeps a valid stored tab', () => {
        const store = createStore();
        store.set(coliseumTabAtom, 'knowledge');
        const { container } = renderView(store);
        expect(container.querySelector('[data-testid="stub-knowledge"]')).toBeTruthy();
        expect(store.get(coliseumTabAtom)).toBe('knowledge');
    });

    it('falls back to the first enabled tab when the stored tab is gated off', () => {
        const store = createStore();
        store.set(coliseumTabAtom, 'reel');
        const container = renderWith(store, <ColiseumView enabledTabs={['topics', 'knowledge']} />);
        expect(container.querySelector('[data-testid="stub-topics"]')).toBeTruthy();
    });

    it('shows the topics feed when a den enables only topic-section tabs', () => {
        // splitColiseumTabs promotes the feed rather than rendering an empty bar.
        const store = createStore();
        const container = renderWith(store, <ColiseumView enabledTabs={['arena', 'match']} />);
        expect(container.querySelector('[data-testid="stub-topics"]')).toBeTruthy();
    });
});
