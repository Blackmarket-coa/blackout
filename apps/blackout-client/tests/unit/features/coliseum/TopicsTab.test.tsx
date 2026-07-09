// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react-dom/test-utils';
import ReactDOM from 'react-dom/client';
import { Provider, createStore } from 'jotai';
import { coliseumTabAtom, selectedColiseumTopicIdAtom } from '../../../../src/app/state/coliseum';
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
    act(() => {
        root.render(
            <Provider store={store}>
                <TopicsTab scope={{ denId: '!den:example.org' }} />
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
    vi.clearAllMocks();
});

describe('TopicsTab topic creation', () => {
    it('creates a topic from the form and selects it', async () => {
        const { container, store } = renderTopics();
        await flush();

        act(() => {
            (
                container.querySelector('[data-testid="coliseum-new-topic"]') as HTMLButtonElement
            ).click();
        });
        await flush();

        // The composer sheet portals to document.body.
        act(() => {
            const inputs = document.querySelectorAll(
                '[data-testid="coliseum-topic-form"] input'
            ) as NodeListOf<HTMLInputElement>;
            setReactValue(inputs[0], 'Should we ratify?');
            setReactValue(inputs[1], 'Council debates the measure');
            setReactValue(inputs[2], 'https://example.org/story');
        });

        await act(async () => {
            (
                document.querySelector(
                    '[data-testid="coliseum-topic-form-submit"]'
                ) as HTMLButtonElement
            ).click();
        });
        await flush();

        expect(createColiseumTopic).toHaveBeenCalledTimes(1);
        const arg = createColiseumTopic.mock.calls[0][0] as Record<string, unknown>;
        expect(arg.title).toBe('Should we ratify?');
        expect(arg.newsAnchor).toMatchObject({
            headline: 'Council debates the measure',
            sourceUrl: 'https://example.org/story',
        });
        expect(arg.denId).toBe('!den:example.org');

        // Selecting the new topic routes to the debate tab.
        expect(store.get(selectedColiseumTopicIdAtom)).toBe('topic-new');
        expect(store.get(coliseumTabAtom)).toBe('debate');
    });

    it('rejects an invalid source link', async () => {
        const { container } = renderTopics();
        await flush();

        act(() => {
            (
                container.querySelector('[data-testid="coliseum-new-topic"]') as HTMLButtonElement
            ).click();
        });
        await flush();

        act(() => {
            const inputs = document.querySelectorAll(
                '[data-testid="coliseum-topic-form"] input'
            ) as NodeListOf<HTMLInputElement>;
            setReactValue(inputs[0], 'Title');
            setReactValue(inputs[1], 'Headline');
            setReactValue(inputs[2], 'not-a-url');
        });

        await act(async () => {
            (
                document.querySelector(
                    '[data-testid="coliseum-topic-form-submit"]'
                ) as HTMLButtonElement
            ).click();
        });
        await flush();

        expect(createColiseumTopic).not.toHaveBeenCalled();
        expect(
            document.querySelector('[data-testid="coliseum-topic-form-error"]')?.textContent
        ).toContain('valid');
    });
});
