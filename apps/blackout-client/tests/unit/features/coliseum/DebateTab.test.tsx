// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider, createStore } from 'jotai';
import { selectedColiseumTopicIdAtom } from '../../../../src/app/state/coliseum';
import {
    DebateTab,
    type DebateTabClient,
} from '../../../../src/app/features/coliseum/tabs/DebateTab';

const topicResponse = {
    topic: {
        id: 'topic-1',
        title: 'Should we ratify the proposal?',
        category: 'governance',
        tags: [],
        status: 'open',
        canopyId: undefined,
        denId: undefined,
        createdAt: '2025-01-01T00:00:00.000Z',
        closesAt: undefined,
        archivesAt: undefined,
        newsAnchor: {
            sourceUrl: 'https://example.org/news',
            headline: 'Anchor',
            publishedAt: '2025-01-01T00:00:00.000Z',
        },
    },
    arguments: [
        {
            id: 'arg-1',
            topicId: 'topic-1',
            authorId: '@alice:example.org',
            stance: 'for',
            stanceWeight: 1,
            body: 'Yes because reasons.',
            citations: [],
            createdAt: '2025-01-01T00:00:00.000Z',
            voteScore: 0.5,
            nuanceScore: 0.4,
        },
    ],
};

const verdictResponse = {
    verdict: {
        winningArgumentId: null,
        consensusArgumentIds: [],
    },
};

vi.mock('../../../../src/app/features/coliseum/coliseumClient', () => ({
    fetchColiseumTopic: vi.fn(async () => topicResponse),
    fetchColiseumVerdict: vi.fn(async () => verdictResponse),
    castColiseumVote: vi.fn(),
    createColiseumArgument: vi.fn(),
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

const renderDebate = (client: DebateTabClient) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    const store = createStore();
    store.set(selectedColiseumTopicIdAtom, 'topic-1');

    act(() => {
        root.render(
            <Provider store={store}>
                <DebateTab client={client} />
            </Provider>
        );
    });

    mountedRoots.push(root);
    return container;
};

describe('DebateTab interactions', () => {
    beforeEach(() => {
        // reset module-level mocks where needed
    });

    afterEach(() => {
        act(() => {
            mountedRoots.splice(0).forEach((root) => root.unmount());
        });
        document.body.innerHTML = '';
    });

    it('casts a vote via the up button and surfaces errors on failure', async () => {
        const castColiseumVote = vi.fn().mockResolvedValueOnce({});
        const createColiseumArgument = vi.fn();
        const container = renderDebate({ castColiseumVote, createColiseumArgument });

        await flush();

        const upButton = container.querySelector(
            '[data-testid="coliseum-vote-up-arg-1"]'
        ) as HTMLButtonElement;
        expect(upButton).toBeTruthy();

        await act(async () => {
            upButton.click();
        });
        await flush();

        expect(castColiseumVote).toHaveBeenCalledWith({
            argumentId: 'arg-1',
            direction: 'up',
        });

        castColiseumVote.mockRejectedValueOnce(new Error('boom'));
        await act(async () => {
            (
                container.querySelector(
                    '[data-testid="coliseum-vote-down-arg-1"]'
                ) as HTMLButtonElement
            ).click();
        });
        await flush();

        expect(
            container.querySelector('[data-testid="coliseum-debate-vote-error"]')?.textContent
        ).toContain('boom');
    });

    it('posts a new argument from the composer', async () => {
        const castColiseumVote = vi.fn();
        const createColiseumArgument = vi.fn().mockResolvedValueOnce({});
        const container = renderDebate({ castColiseumVote, createColiseumArgument });

        await flush();

        const stance = container.querySelector(
            '[data-testid="coliseum-debate-composer-stance"]'
        ) as HTMLSelectElement;
        const body = container.querySelector(
            '[data-testid="coliseum-debate-composer-body"]'
        ) as HTMLTextAreaElement;
        const submit = container.querySelector(
            '[data-testid="coliseum-debate-composer-submit"]'
        ) as HTMLButtonElement;

        act(() => {
            setReactValue(stance, 'against');
            setReactValue(body, 'I disagree.');
        });

        await act(async () => {
            submit
                .closest('form')!
                .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });
        await flush();

        expect(createColiseumArgument).toHaveBeenCalledWith({
            topicId: 'topic-1',
            stance: 'against',
            body: 'I disagree.',
        });
    });

    it('posts a rebuttal carrying the parent argument id', async () => {
        const castColiseumVote = vi.fn();
        const createColiseumArgument = vi.fn().mockResolvedValueOnce({});
        const container = renderDebate({ castColiseumVote, createColiseumArgument });

        await flush();

        const rebut = container.querySelector(
            '[data-testid="coliseum-rebut-arg-1"]'
        ) as HTMLButtonElement;
        expect(rebut).toBeTruthy();

        await act(async () => {
            rebut.click();
        });
        await flush();

        // The composer now shows the rebuttal context.
        expect(
            container.querySelector('[data-testid="coliseum-composer-replying-to"]')?.textContent
        ).toContain('@alice:example.org');

        const body = container.querySelector(
            '[data-testid="coliseum-debate-composer-body"]'
        ) as HTMLTextAreaElement;
        act(() => {
            setReactValue(body, 'Your data excludes substations.');
        });

        await act(async () => {
            (
                container.querySelector(
                    '[data-testid="coliseum-debate-composer-submit"]'
                ) as HTMLButtonElement
            )
                .closest('form')!
                .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });
        await flush();

        expect(createColiseumArgument).toHaveBeenCalledWith({
            topicId: 'topic-1',
            parentArgumentId: 'arg-1',
            stance: 'against',
            body: 'Your data excludes substations.',
        });
    });

    it('shows a validation error when submitting an empty body', async () => {
        const castColiseumVote = vi.fn();
        const createColiseumArgument = vi.fn();
        const container = renderDebate({ castColiseumVote, createColiseumArgument });

        await flush();

        const submit = container.querySelector(
            '[data-testid="coliseum-debate-composer-submit"]'
        ) as HTMLButtonElement;

        await act(async () => {
            submit
                .closest('form')!
                .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });
        await flush();

        expect(createColiseumArgument).not.toHaveBeenCalled();
        expect(
            container.querySelector('[data-testid="coliseum-debate-composer-error"]')?.textContent
        ).toContain('required');
    });
});
