// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    arguments: [],
};

vi.mock('../../../../src/app/features/coliseum/coliseumClient', () => ({
    fetchColiseumTopic: vi.fn(async () => topicResponse),
    fetchColiseumVerdict: vi.fn(async () => ({
        verdict: { winningArgumentId: null, consensusArgumentIds: [] },
    })),
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

/** The composer lives in a bottom sheet portaled to document.body. */
const openComposer = (container: HTMLElement) => {
    act(() => {
        (
            container.querySelector(
                '[data-testid="coliseum-debate-composer-open"]'
            ) as HTMLButtonElement
        ).click();
    });
};

afterEach(() => {
    act(() => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
    });
    document.body.innerHTML = '';
    vi.clearAllMocks();
});

describe('DebateTab video attachment', () => {
    it('hides the video control when no uploader is available', async () => {
        const container = renderDebate({
            castColiseumVote: vi.fn(),
            createColiseumArgument: vi.fn(),
        });
        await flush();
        openComposer(container);
        expect(document.querySelector('[data-testid="coliseum-debate-composer-video"]')).toBeNull();
    });

    it('uploads the picked video and posts the argument with its mxc media', async () => {
        const uploadArgumentVideo = vi.fn().mockResolvedValue('mxc://server/abc123');
        const createColiseumArgument = vi.fn().mockResolvedValue({});
        const container = renderDebate({
            castColiseumVote: vi.fn(),
            createColiseumArgument,
            uploadArgumentVideo,
        });
        await flush();
        openComposer(container);

        const fileInput = document.querySelector(
            '[data-testid="coliseum-debate-composer-video"]'
        ) as HTMLInputElement;
        expect(fileInput).toBeTruthy();

        const file = new File(['fake-bytes'], 'argument.webm', { type: 'video/webm' });
        Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
        await act(async () => {
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await flush();

        // The staged-video chip should appear.
        expect(
            document.querySelector('[data-testid="coliseum-debate-composer-video-preview"]')
        ).toBeTruthy();

        const body = document.querySelector(
            '[data-testid="coliseum-debate-composer-body"]'
        ) as HTMLTextAreaElement;
        act(() => setReactValue(body, 'Watch my clip.'));

        const submit = document.querySelector(
            '[data-testid="coliseum-debate-composer-submit"]'
        ) as HTMLButtonElement;
        await act(async () => {
            submit
                .closest('form')!
                .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });
        await flush();

        expect(uploadArgumentVideo).toHaveBeenCalledWith(file);
        expect(createColiseumArgument).toHaveBeenCalledWith(
            expect.objectContaining({
                topicId: 'topic-1',
                body: 'Watch my clip.',
                media: expect.objectContaining({ kind: 'video', mxc: 'mxc://server/abc123' }),
            })
        );

        // The sheet closes after a successful post (staged video cleared with it).
        expect(
            document.querySelector('[data-testid="coliseum-debate-composer-video-preview"]')
        ).toBeNull();
    });

    it('surfaces an error and does not post when the upload fails', async () => {
        const uploadArgumentVideo = vi.fn().mockRejectedValue(new Error('upload boom'));
        const createColiseumArgument = vi.fn();
        const container = renderDebate({
            castColiseumVote: vi.fn(),
            createColiseumArgument,
            uploadArgumentVideo,
        });
        await flush();
        openComposer(container);

        const fileInput = document.querySelector(
            '[data-testid="coliseum-debate-composer-video"]'
        ) as HTMLInputElement;
        const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
        Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
        await act(async () => {
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        const body = document.querySelector(
            '[data-testid="coliseum-debate-composer-body"]'
        ) as HTMLTextAreaElement;
        act(() => setReactValue(body, 'Body text'));

        const submit = document.querySelector(
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
            document.querySelector('[data-testid="coliseum-debate-composer-error"]')?.textContent
        ).toContain('upload boom');
    });
});
