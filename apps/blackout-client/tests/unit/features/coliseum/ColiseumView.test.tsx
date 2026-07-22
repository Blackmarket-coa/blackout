// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider, createStore } from 'jotai';
import {
    coliseumReturnTabAtom,
    coliseumTabAtom,
    selectedColiseumTopicIdAtom,
} from '../../../../src/app/state/coliseum';
import { ColiseumView } from '../../../../src/app/features/coliseum/ColiseumView';

// Stub every tab so the view test doesn't pull in network hooks / Matrix deps.
// (vi.mock factories are hoisted, so each stub is declared inline.)
vi.mock('../../../../src/app/features/coliseum/tabs/ReelTab', () => ({
    default: () => <div data-testid="stub-reel" />,
}));
vi.mock('../../../../src/app/features/coliseum/tabs/TopicsTab', () => ({
    default: () => <div data-testid="stub-topics" />,
}));
vi.mock('../../../../src/app/features/coliseum/tabs/DebateTab', () => ({
    default: () => <div data-testid="stub-debate" />,
}));
vi.mock('../../../../src/app/features/coliseum/tabs/LiveTab', () => ({
    default: () => <div data-testid="stub-live" />,
}));
vi.mock('../../../../src/app/features/coliseum/tabs/ChallengesTab', () => ({
    default: () => <div data-testid="stub-challenges" />,
}));
vi.mock('../../../../src/app/features/coliseum/tabs/ArenaTab', () => ({
    default: () => <div data-testid="stub-arena" />,
}));
vi.mock('../../../../src/app/features/coliseum/tabs/MatchTab', () => ({
    default: () => <div data-testid="stub-match" />,
}));
vi.mock('../../../../src/app/features/coliseum/tabs/ShoutsTab', () => ({
    default: () => <div data-testid="stub-shouts" />,
}));
vi.mock('../../../../src/app/features/coliseum/tabs/LeaderboardsTab', () => ({
    default: () => <div data-testid="stub-leaderboards" />,
}));
vi.mock('../../../../src/app/features/coliseum/tabs/SourcesTab', () => ({
    default: () => <div data-testid="stub-sources" />,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: ReactDOM.Root[] = [];

const renderView = (store = createStore()) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    act(() => {
        root.render(
            <Provider store={store}>
                <ColiseumView scopeLabel="Standalone" />
            </Provider>
        );
    });
    mountedRoots.push(root);
    return { container, store };
};

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

    it('redirects a stale debate tab without a topic to the topics feed', () => {
        const store = createStore();
        store.set(coliseumTabAtom, 'debate');
        store.set(selectedColiseumTopicIdAtom, null);
        const { container } = renderView(store);
        expect(container.querySelector('[data-testid="stub-topics"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="stub-debate"]')).toBeNull();
        expect(store.get(coliseumTabAtom)).toBe('topics');
    });

    it('renders the debate drill-in with a back bar and returns to the origin tab', () => {
        const store = createStore();
        store.set(coliseumTabAtom, 'debate');
        store.set(selectedColiseumTopicIdAtom, 'topic-1');
        store.set(coliseumReturnTabAtom, 'reel');
        const { container } = renderView(store);
        expect(container.querySelector('[data-testid="stub-debate"]')).toBeTruthy();
        const back = container.querySelector(
            '[data-testid="coliseum-debate-back"]'
        ) as HTMLButtonElement;
        expect(back).toBeTruthy();
        act(() => {
            back.click();
        });
        expect(store.get(coliseumTabAtom)).toBe('reel');
        expect(container.querySelector('[data-testid="stub-reel"]')).toBeTruthy();
    });

    it('renders the debate drill-in even when a den omits debate from enabledTabs', () => {
        const store = createStore();
        store.set(coliseumTabAtom, 'debate');
        store.set(selectedColiseumTopicIdAtom, 'topic-1');
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        act(() => {
            root.render(
                <Provider store={store}>
                    <ColiseumView enabledTabs={['reel', 'topics', 'live']} />
                </Provider>
            );
        });
        mountedRoots.push(root);
        expect(container.querySelector('[data-testid="stub-debate"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="coliseum-debate-back-bar"]')).toBeTruthy();
        expect(store.get(coliseumTabAtom)).toBe('debate');
    });

    it('still redirects a topicless debate tab when a den omits debate from enabledTabs', () => {
        const store = createStore();
        store.set(coliseumTabAtom, 'debate');
        store.set(selectedColiseumTopicIdAtom, null);
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        act(() => {
            root.render(
                <Provider store={store}>
                    <ColiseumView enabledTabs={['reel', 'topics', 'live']} />
                </Provider>
            );
        });
        mountedRoots.push(root);
        expect(container.querySelector('[data-testid="stub-topics"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="stub-debate"]')).toBeNull();
        expect(store.get(coliseumTabAtom)).toBe('topics');
    });

    it('falls back to the first enabled tab when the stored tab is gated off', () => {
        const store = createStore();
        store.set(coliseumTabAtom, 'reel');
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        act(() => {
            root.render(
                <Provider store={store}>
                    <ColiseumView enabledTabs={['topics', 'live']} />
                </Provider>
            );
        });
        mountedRoots.push(root);
        expect(container.querySelector('[data-testid="stub-topics"]')).toBeTruthy();
    });
});
