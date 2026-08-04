// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider, createStore } from 'jotai';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ColiseumTopic } from '@blackout/core';
import { selectedColiseumTopicIdAtom } from '../../../../src/app/state/coliseum';
import { TopicPage } from '../../../../src/app/features/coliseum/TopicPage';

const fetchColiseumTopic = vi.fn();
const fetchColiseumVerdict = vi.fn(async () => ({ verdict: { winningArgumentId: null } }));
const fetchColiseumMatches = vi.fn(async () => ({
    generatedAt: '2026-05-02T12:00:00.000Z',
    matches: [] as unknown[],
}));

vi.mock('../../../../src/app/features/coliseum/coliseumClient', () => ({
    fetchColiseumTopic: (...args: unknown[]) => fetchColiseumTopic(...(args as [])),
    fetchColiseumVerdict: (...args: unknown[]) => fetchColiseumVerdict(...(args as [])),
    fetchColiseumTopics: vi.fn(async () => ({ generatedAt: '', topics: [] })),
    fetchColiseumReel: vi.fn(async () => ({ items: [], nextOffset: null })),
}));

vi.mock('../../../../src/app/features/coliseum/coliseumMatchClient', () => ({
    fetchColiseumMatches: (...args: unknown[]) => fetchColiseumMatches(...(args as [])),
}));

// The reused section bodies pull in Matrix and network deps; the page's own
// behaviour is the section gating, so stub them out.
vi.mock('../../../../src/app/features/coliseum/tabs/DebateTab', () => ({
    default: () => <div data-testid="stub-debate" />,
}));
vi.mock('../../../../src/app/features/coliseum/tabs/MatchTab', () => ({
    default: () => <div data-testid="stub-match" />,
}));
vi.mock('../../../../src/app/features/coliseum/tabs/LiveTab', () => ({
    default: () => <div data-testid="stub-live" />,
}));
vi.mock('../../../../src/app/features/coliseum/tabs/SourcesTab', () => ({
    default: () => <div data-testid="stub-sources" />,
}));
vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClientOrNull: () => null,
    useMatrixClient: () => null,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: ReactDOM.Root[] = [];

const TOPIC: ColiseumTopic = {
    id: 'topic-1',
    title: 'Should we ratify?',
    seed: { kind: 'text' },
    createdAt: '2026-05-02T11:00:00Z',
    tags: [],
    status: 'active',
    recencyScore: 0.5,
    velocityScore: 0.5,
    debateHeat: 0.5,
};

const argument = (overrides: Record<string, unknown> = {}) => ({
    id: 'arg-1',
    topicId: 'topic-1',
    authorId: '@a:server',
    stance: 'for',
    stanceWeight: 0.8,
    body: 'Yes because…',
    citations: [],
    createdAt: '2026-05-02T11:30:00Z',
    voteScore: 0.6,
    nuanceScore: 0.2,
    score: 0.7,
    ...overrides,
});

const flush = async () => {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
};

const renderPage = () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    const store = createStore();
    const router = createMemoryRouter(
        [{ path: '/coliseum/topics/:topicId', element: <TopicPage /> }],
        {
            initialEntries: ['/coliseum/topics/topic-1'],
        }
    );
    act(() => {
        root.render(
            <Provider store={store}>
                <RouterProvider router={router} />
            </Provider>
        );
    });
    mountedRoots.push(root);
    return { container, store, router };
};

beforeEach(() => {
    fetchColiseumTopic.mockResolvedValue({ topic: TOPIC, arguments: [] });
    fetchColiseumMatches.mockResolvedValue({ generatedAt: '', matches: [] });
});

afterEach(() => {
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
    vi.clearAllMocks();
});

describe('TopicPage — section gating', () => {
    /**
     * A freshly proposed question should be a short, calm page. Rendering an
     * empty Arguments/Match/Sources shell is exactly the clutter this
     * consolidation is meant to remove.
     */
    it('shows only the proposition for a bare question with no activity', async () => {
        const { container } = renderPage();
        await flush();

        expect(container.querySelector('[data-testid="topic-proposition"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="topic-pulse"]')).toBeNull();
        expect(container.querySelector('[data-testid="stub-debate"]')).toBeNull();
        expect(container.querySelector('[data-testid="topic-match"]')).toBeNull();
        expect(container.querySelector('[data-testid="topic-sources"]')).toBeNull();
    });

    it('adds the pulse and arguments once someone has argued', async () => {
        fetchColiseumTopic.mockResolvedValue({ topic: TOPIC, arguments: [argument()] });
        const { container } = renderPage();
        await flush();

        expect(container.querySelector('[data-testid="topic-pulse"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="stub-debate"]')).toBeTruthy();
        // Still no sources — nothing has been cited.
        expect(container.querySelector('[data-testid="topic-sources"]')).toBeNull();
    });

    it('adds sources only once an argument cites something', async () => {
        fetchColiseumTopic.mockResolvedValue({
            topic: TOPIC,
            arguments: [
                argument({
                    citations: [{ kind: 'article', sourceUrl: 'https://x', title: 'X' }],
                }),
            ],
        });
        const { container } = renderPage();
        await flush();

        expect(container.querySelector('[data-testid="topic-sources"]')).toBeTruthy();
    });

    /**
     * `propositionTopicId` has been stored since matches shipped, but nothing
     * ever read it back — this join is what lets a topic show its fight.
     */
    it('adds the match section when a match was fought over this topic', async () => {
        fetchColiseumMatches.mockResolvedValue({
            generatedAt: '',
            matches: [{ id: 'match-1', propositionTopicId: 'topic-1' }],
        });
        const { container } = renderPage();
        await flush();

        expect(fetchColiseumMatches).toHaveBeenCalledWith(
            expect.objectContaining({ propositionTopicId: 'topic-1' })
        );
        expect(container.querySelector('[data-testid="topic-match"]')).toBeTruthy();
    });

    it('treats a topic with no match as ordinary, not an error', async () => {
        fetchColiseumMatches.mockRejectedValue(new Error('nope'));
        const { container } = renderPage();
        await flush();

        expect(container.querySelector('[data-testid="topic-proposition"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="topic-match"]')).toBeNull();
    });
});

describe('TopicPage — addressability', () => {
    it('drives the selected-topic atom from the route param', async () => {
        const { store } = renderPage();
        await flush();
        // The reused section bodies read the atom; the URL is the source of truth.
        expect(store.get(selectedColiseumTopicIdAtom)).toBe('topic-1');
    });

    it('renders the seed natively — a bare question shows no article line', async () => {
        const { container } = renderPage();
        await flush();
        expect(container.querySelector('[data-testid="topic-proposition-link"]')).toBeNull();
    });

    it('shows the article line for a link-seeded topic', async () => {
        fetchColiseumTopic.mockResolvedValue({
            topic: {
                ...TOPIC,
                seed: {
                    kind: 'link',
                    sourceUrl: 'https://news.example/story',
                    headline: 'Something happened',
                    publishedAt: '2026-05-02T10:00:00Z',
                },
            },
            arguments: [],
        });
        const { container } = renderPage();
        await flush();

        const link = container.querySelector('[data-testid="topic-proposition-link"]');
        expect(link?.getAttribute('href')).toBe('https://news.example/story');
    });

    it('names the opponent on a challenge-seeded topic', async () => {
        fetchColiseumTopic.mockResolvedValue({
            topic: { ...TOPIC, seed: { kind: 'challenge', opponentId: '@rival:server' } },
            arguments: [],
        });
        const { container } = renderPage();
        await flush();

        expect(
            container.querySelector('[data-testid="topic-proposition-challenge"]')?.textContent
        ).toContain('@rival:server');
    });
});
