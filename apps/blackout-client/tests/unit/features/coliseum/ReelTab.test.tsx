// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider, createStore } from 'jotai';
import { ReelTab } from '../../../../src/app/features/coliseum/tabs/ReelTab';
import { coliseumTabAtom, selectedColiseumTopicIdAtom } from '../../../../src/app/state/coliseum';

const makeItem = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    topicId: `topic-${id}`,
    topicTitle: `Topic for ${id}`,
    stance: 'for',
    body: `Argument body ${id}`,
    authorId: '@debater:example.org',
    citations: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    voteScore: 0.75,
    nuanceScore: 0.5,
    media: { kind: 'video', mxc: `mxc://example.org/${id}` },
    ...overrides,
});

const reelState: {
    items: ReturnType<typeof makeItem>[];
    hasMore: boolean;
    loadMore: ReturnType<typeof vi.fn>;
} = {
    items: [],
    hasMore: false,
    loadMore: vi.fn(),
};

vi.mock('../../../../src/app/features/coliseum/hooks/useColiseumTopics', () => ({
    useColiseumReel: () => ({
        items: reelState.items,
        loading: false,
        error: null,
        hasMore: reelState.hasMore,
        loadMore: reelState.loadMore,
    }),
    useColiseumTopic: () => ({ data: null, loading: false, error: null, refetch: vi.fn() }),
    useColiseumVerdict: () => ({ data: null, loading: false, error: null, refetch: vi.fn() }),
}));

vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClientOrNull: () => ({}),
}));

vi.mock('../../../../src/app/utils/matrix', () => ({
    mxcUrlToHttp: (_mx: unknown, mxc: string) =>
        `https://media.example.org/${mxc.split('/').pop()}`,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: ReactDOM.Root[] = [];

const renderReel = (client = { castColiseumVote: vi.fn(async () => ({})) }) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    const store = createStore();
    store.set(selectedColiseumTopicIdAtom, null);
    act(() => {
        root.render(
            <Provider store={store}>
                <ReelTab client={client} />
            </Provider>
        );
    });
    mountedRoots.push(root);
    return { container, store, client };
};

beforeEach(() => {
    window.localStorage.setItem('bmc-coliseum-reel-hint-seen', '1');
    reelState.items = [
        makeItem('a'),
        makeItem('b'),
        makeItem('c'),
        makeItem('d', { media: undefined }),
    ];
    reelState.hasMore = false;
    reelState.loadMore = vi.fn();
    // jsdom's HTMLMediaElement has no real play/pause.
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
        configurable: true,
        writable: true,
        value: vi.fn(() => Promise.resolve()),
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
        configurable: true,
        writable: true,
        value: vi.fn(),
    });
});

afterEach(() => {
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
    window.localStorage.clear();
    vi.clearAllMocks();
});

describe('ReelTab (global For You reel)', () => {
    it('renders every slide but mounts video elements only near the active index', () => {
        const { container } = renderReel();
        const cards = container.querySelectorAll('[data-testid="coliseum-reel-card"]');
        expect(cards.length).toBe(4);
        // Active = 0 → videos mount for indexes 0 and 1 only (item d has no media).
        const videos = container.querySelectorAll('[data-testid="coliseum-reel-video"]');
        expect(videos.length).toBe(2);
        expect(cards[0].getAttribute('data-active')).toBe('true');
    });

    it('navigates with the keyboard and expands the mounted media window', () => {
        const { container } = renderReel();
        const feed = container.querySelector('[data-testid="coliseum-reel-global"]') as HTMLElement;
        act(() => {
            feed.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        });
        const cards = container.querySelectorAll('[data-testid="coliseum-reel-card"]');
        expect(cards[1].getAttribute('data-active')).toBe('true');
        // Active = 1 → videos for 0, 1, 2.
        expect(container.querySelectorAll('[data-testid="coliseum-reel-video"]').length).toBe(3);
    });

    it('casts a vote from the action rail and flashes feedback', () => {
        const client = { castColiseumVote: vi.fn(async () => ({})) };
        const { container } = renderReel(client);
        act(() => {
            (
                container.querySelector(
                    '[data-testid="coliseum-reel-vote-up-a"]'
                ) as HTMLButtonElement
            ).click();
        });
        expect(client.castColiseumVote).toHaveBeenCalledWith({
            argumentId: 'a',
            direction: 'up',
        });
        expect(container.querySelector('[data-testid="coliseum-reel-flash-up"]')).toBeTruthy();
    });

    it('registers agree on double-tap of the media layer', () => {
        const client = { castColiseumVote: vi.fn(async () => ({})) };
        const { container } = renderReel(client);
        const video = container.querySelector('[data-testid="coliseum-reel-video"]') as HTMLElement;
        // jsdom has no PointerEvent constructor; MouseEvent with the pointer
        // type name reaches React's onPointer* handlers just the same.
        const tap = () => {
            video.dispatchEvent(
                new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100 })
            );
            video.dispatchEvent(
                new MouseEvent('pointerup', { bubbles: true, clientX: 100, clientY: 100 })
            );
        };
        act(() => {
            tap();
            tap();
        });
        expect(client.castColiseumVote).toHaveBeenCalledWith({
            argumentId: 'a',
            direction: 'up',
        });
    });

    it('toggles and reflects the mute state', () => {
        const { container } = renderReel();
        const mute = container.querySelector(
            '[data-testid="coliseum-reel-mute"]'
        ) as HTMLButtonElement;
        expect(mute.getAttribute('aria-pressed')).toBe('true');
        act(() => {
            mute.click();
        });
        expect(mute.getAttribute('aria-pressed')).toBe('false');
        const video = container.querySelector(
            '[data-testid="coliseum-reel-video"]'
        ) as HTMLVideoElement;
        expect(video.muted).toBe(false);
    });

    it('opens the debate drill-in from the rail comments button', () => {
        const { container, store } = renderReel();
        act(() => {
            (
                container.querySelector(
                    '[data-testid="coliseum-reel-rail-debate-a"]'
                ) as HTMLButtonElement
            ).click();
        });
        expect(store.get(selectedColiseumTopicIdAtom)).toBe('topic-a');
        expect(store.get(coliseumTabAtom)).toBe('debate');
    });

    it('shares via clipboard fallback with a deep link', async () => {
        const writeText = vi.fn(async () => undefined);
        Object.defineProperty(window.navigator, 'clipboard', {
            configurable: true,
            value: { writeText },
        });
        const { container } = renderReel();
        await act(async () => {
            (
                container.querySelector(
                    '[data-testid="coliseum-reel-rail-share-a"]'
                ) as HTMLButtonElement
            ).click();
            await Promise.resolve();
        });
        expect(writeText).toHaveBeenCalledTimes(1);
        expect(writeText.mock.calls[0][0]).toContain('/coliseum?tab=debate&topic=topic-a');
    });

    it('shows the one-time hint overlay and persists dismissal', () => {
        window.localStorage.removeItem('bmc-coliseum-reel-hint-seen');
        const { container } = renderReel();
        expect(container.querySelector('[data-testid="coliseum-reel-hint"]')).toBeTruthy();
        act(() => {
            (
                container.querySelector(
                    '[data-testid="coliseum-reel-hint-dismiss"]'
                ) as HTMLButtonElement
            ).click();
        });
        expect(container.querySelector('[data-testid="coliseum-reel-hint"]')).toBeNull();
        expect(window.localStorage.getItem('bmc-coliseum-reel-hint-seen')).toBe('1');
    });

    it('marks an open-ended feed in the position pill', () => {
        reelState.hasMore = true;
        const { container } = renderReel();
        expect(container.querySelector('[data-testid="coliseum-reel-position"]')?.textContent).toBe(
            '1 / 4+'
        );
    });
});
