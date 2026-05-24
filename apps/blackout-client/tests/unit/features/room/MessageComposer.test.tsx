// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendRichText = vi.fn().mockResolvedValue(undefined);
const sendMedia = vi.fn().mockResolvedValue(undefined);
const editMessage = vi.fn().mockResolvedValue(undefined);
const sendTyping = vi.fn().mockResolvedValue(undefined);
const createScheduledMessage = vi
    .fn()
    .mockResolvedValue({ scheduledMessage: { id: 's1', status: 'pending' } });

vi.mock('../../../../src/app/plugins/matrix-adapters/hooks/useLegacyTimelineAdapter', () => ({
    useLegacySendMessageAdapter: () => ({ sendRichText, sendMedia }),
    useLegacyEditMessageAdapter: () => editMessage,
}));
vi.mock('../../../../src/app/plugins/matrix-adapters/hooks/useLegacyTypingAdapter', () => ({
    useLegacySendTypingAdapter: () => sendTyping,
}));
vi.mock('../../../../src/app/plugins/matrix-adapters/hooks/useLegacyRoomAdapter', () => ({
    useLegacyRoomMembersAdapter: () => ({ data: [] }),
}));
vi.mock('../../../../src/app/plugins/navigation', () => ({
    useNavigationSpaceTree: () => ({ data: [] }),
}));
vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => ({}),
}));
vi.mock('../../../../src/app/features/room/attachments/useAttachPhoto', () => ({
    useAttachPhoto: () => vi.fn(),
}));
vi.mock('../../../../src/app/features/room/scheduledMessagesClient', () => ({
    createScheduledMessage: (...args: unknown[]) => createScheduledMessage(...args),
}));

import { MessageComposer } from '../../../../src/app/features/room/MessageComposer';

const mountComposer = async (props: { roomId?: string; initialMarkdown?: string } = {}) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(
            <Provider store={createStore()}>
                <MessageComposer
                    roomId={props.roomId ?? '!room:test'}
                    initialMarkdown={props.initialMarkdown}
                />
            </Provider>
        );
        await Promise.resolve();
    });
    return { container, root };
};

const findButton = (container: HTMLElement, text: string): HTMLButtonElement | undefined =>
    [...container.querySelectorAll('button')].find((btn) => btn.textContent?.trim() === text) as
        | HTMLButtonElement
        | undefined;

const findByLabel = (container: HTMLElement, label: string): HTMLButtonElement | undefined =>
    container.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | undefined;

const click = async (el: Element | undefined) => {
    await act(async () => {
        el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await Promise.resolve();
    });
};

beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    document.body.innerHTML = '';
    window.matchMedia =
        window.matchMedia ??
        ((query: string) =>
            ({
                matches: false,
                media: query,
                onchange: null,
                addEventListener: () => {},
                removeEventListener: () => {},
                addListener: () => {},
                removeListener: () => {},
                dispatchEvent: () => false,
            } as unknown as MediaQueryList));
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('MessageComposer', () => {
    it('sends seeded text once and clears so a second send is a no-op', async () => {
        const { container } = await mountComposer({ initialMarkdown: 'hello world' });

        const send = findButton(container, 'Send');
        expect(send).toBeTruthy();

        await click(send);
        expect(sendRichText).toHaveBeenCalledTimes(1);
        const content = sendRichText.mock.calls[0][0] as { body: string };
        expect(content.body).toContain('hello world');

        // After a successful send the composer must be empty; a second click
        // hits the empty-body guard and does not send again. This is the
        // regression guard for the Slate "text stays in the box" bug.
        await click(findButton(container, 'Send'));
        expect(sendRichText).toHaveBeenCalledTimes(1);
    });

    it('renders the formatting toolbar', async () => {
        const { container } = await mountComposer();
        expect(findButton(container, 'B')).toBeTruthy();
        expect(findButton(container, 'I')).toBeTruthy();
        expect(findButton(container, 'S')).toBeTruthy();
        expect(findButton(container, '</>')).toBeTruthy();
    });

    it('routes a scheduled send to the server API instead of sending immediately', async () => {
        const { container } = await mountComposer({ initialMarkdown: 'later message' });

        await click(findByLabel(container, 'Open composer features'));
        await click(findButton(container, 'Scheduled send preset'));
        await click(findButton(container, 'Send'));

        expect(createScheduledMessage).toHaveBeenCalledTimes(1);
        const input = createScheduledMessage.mock.calls[0][0] as {
            matrixRoomId: string;
            body: string;
            deliverAt: string;
        };
        expect(input.body).toContain('later message');
        expect(input.matrixRoomId).toBe('!room:test');
        expect(Date.parse(input.deliverAt)).toBeGreaterThan(Date.now());
        expect(sendRichText).not.toHaveBeenCalled();
    });

    it('persists a draft to localStorage as the user composes', async () => {
        await mountComposer({ roomId: '!draftroom:test', initialMarkdown: 'draft body' });
        // The draft-save effect runs on the seeded value.
        await act(async () => {
            await Promise.resolve();
        });
        expect(window.localStorage.getItem('blackout.draft.!draftroom:test')).toContain(
            'draft body'
        );
    });
});
