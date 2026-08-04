// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider, createStore } from 'jotai';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { selectedColiseumTopicIdAtom } from '../../../../src/app/state/coliseum';
import { TopicsTab } from '../../../../src/app/features/coliseum/tabs/TopicsTab';

const fetchColiseumTopics = vi.fn(async () => ({
    generatedAt: '2025-01-01T00:00:00.000Z',
    topics: [],
}));
const createColiseumTopic = vi.fn(async () => ({ topic: { id: 'topic-new' } }));

vi.mock('../../../../src/app/features/coliseum/coliseumClient', () => ({
    fetchColiseumTopics: (...args: unknown[]) => fetchColiseumTopics(...(args as [])),
    createColiseumTopic: (...args: unknown[]) => createColiseumTopic(...(args as [])),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const setReactValue = (
    element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
    value: string
) => {
    const proto =
        element instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : element instanceof HTMLSelectElement
            ? HTMLSelectElement.prototype
            : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
};

const mountedRoots: ReactDOM.Root[] = [];

const flush = async () => {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
};

const renderTopics = () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    const store = createStore();
    // TopicsTab navigates to the topic's own route on select, so it needs a
    // router in the tree.
    const router = createMemoryRouter(
        [{ path: '*', element: <TopicsTab scope={{ denId: '!den:example.org' }} /> }],
        { initialEntries: ['/coliseum'] }
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

const openComposer = async (container: HTMLElement) => {
    act(() => {
        (
            container.querySelector('[data-testid="coliseum-new-topic"]') as HTMLButtonElement
        ).click();
    });
    await flush();
};

const pickKind = (kind: string) => {
    act(() => {
        (
            document.querySelector(
                `[data-testid="coliseum-topic-kind-${kind}"]`
            ) as HTMLButtonElement
        ).click();
    });
};

const setTitle = (value: string) => {
    act(() => {
        setReactValue(
            document.querySelector('[data-testid="coliseum-topic-title"]') as HTMLInputElement,
            value
        );
    });
};

const submit = async () => {
    await act(async () => {
        (
            document.querySelector(
                '[data-testid="coliseum-topic-form-submit"]'
            ) as HTMLButtonElement
        ).click();
    });
    await flush();
};

afterEach(() => {
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
    vi.clearAllMocks();
});

describe('TopicsTab — proposing a topic in any form', () => {
    /**
     * The headline change: this used to be impossible. The composer refused to
     * submit without a title, a headline *and* a source URL.
     */
    it('proposes a bare question with no link at all', async () => {
        const { container, store, router } = renderTopics();
        await flush();
        await openComposer(container);

        pickKind('text');
        setTitle('Should we ratify?');
        await submit();

        expect(createColiseumTopic).toHaveBeenCalledTimes(1);
        const arg = createColiseumTopic.mock.calls[0][0] as Record<string, unknown>;
        expect(arg.title).toBe('Should we ratify?');
        expect(arg.seed).toEqual({ kind: 'text' });
        expect(arg.denId).toBe('!den:example.org');

        // The new topic is opened at its own address, not a tab selection.
        expect(store.get(selectedColiseumTopicIdAtom)).toBe('topic-new');
        expect(router.state.location.pathname).toBe('/coliseum/topics/topic-new');
    });

    it('proposes a link topic, carrying the article into a link seed', async () => {
        const { container } = renderTopics();
        await flush();
        await openComposer(container);

        pickKind('link');
        setTitle('Should we ratify?');
        act(() => {
            const inputs = document.querySelectorAll(
                '[data-testid="coliseum-topic-form"] input'
            ) as NodeListOf<HTMLInputElement>;
            // title, headline, sourceUrl, publishedAt, tags
            setReactValue(inputs[1], 'Council debates the measure');
            setReactValue(inputs[2], 'https://example.org/story');
        });
        await submit();

        const arg = createColiseumTopic.mock.calls[0][0] as Record<string, unknown>;
        expect(arg.seed).toMatchObject({
            kind: 'link',
            headline: 'Council debates the measure',
            sourceUrl: 'https://example.org/story',
        });
    });

    it('proposes a challenge, open when no opponent is named', async () => {
        const { container } = renderTopics();
        await flush();
        await openComposer(container);

        pickKind('challenge');
        setTitle('I say the grid holds');
        await submit();

        expect(createColiseumTopic.mock.calls[0][0]).toMatchObject({
            seed: { kind: 'challenge', open: true },
        });
    });

    it('proposes a challenge aimed at a named opponent', async () => {
        const { container } = renderTopics();
        await flush();
        await openComposer(container);

        pickKind('challenge');
        setTitle('I say the grid holds');
        act(() => {
            setReactValue(
                document.querySelector(
                    '[data-testid="coliseum-topic-opponent"]'
                ) as HTMLInputElement,
                '@rival:server'
            );
        });
        await submit();

        expect(createColiseumTopic.mock.calls[0][0]).toMatchObject({
            seed: { kind: 'challenge', opponentId: '@rival:server' },
        });
    });

    it('proposes a media take from an mxc reference', async () => {
        const { container } = renderTopics();
        await flush();
        await openComposer(container);

        pickKind('media');
        setTitle('My take');
        act(() => {
            setReactValue(
                document.querySelector('[data-testid="coliseum-topic-media"]') as HTMLInputElement,
                'mxc://example.org/abc'
            );
        });
        await submit();

        expect(createColiseumTopic.mock.calls[0][0]).toMatchObject({
            seed: { kind: 'media', media: { kind: 'video', mxc: 'mxc://example.org/abc' } },
        });
    });
});

describe('TopicsTab — composer validation', () => {
    it('requires a title whatever the form', async () => {
        const { container } = renderTopics();
        await flush();
        await openComposer(container);

        pickKind('text');
        await submit();

        expect(createColiseumTopic).not.toHaveBeenCalled();
        expect(
            document.querySelector('[data-testid="coliseum-topic-form-error"]')?.textContent
        ).toContain('what the topic is');
    });

    it('rejects an invalid source link on a link topic', async () => {
        const { container } = renderTopics();
        await flush();
        await openComposer(container);

        pickKind('link');
        setTitle('Title');
        act(() => {
            const inputs = document.querySelectorAll(
                '[data-testid="coliseum-topic-form"] input'
            ) as NodeListOf<HTMLInputElement>;
            setReactValue(inputs[1], 'Headline');
            setReactValue(inputs[2], 'not-a-url');
        });
        await submit();

        expect(createColiseumTopic).not.toHaveBeenCalled();
        expect(
            document.querySelector('[data-testid="coliseum-topic-form-error"]')?.textContent
        ).toContain('valid');
    });

    it('rejects a media topic with no attachment', async () => {
        const { container } = renderTopics();
        await flush();
        await openComposer(container);

        pickKind('media');
        setTitle('My take');
        await submit();

        expect(createColiseumTopic).not.toHaveBeenCalled();
        expect(
            document.querySelector('[data-testid="coliseum-topic-form-error"]')?.textContent
        ).toContain('Attach');
    });
});
