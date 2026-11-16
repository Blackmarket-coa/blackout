// @vitest-environment jsdom
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlackoutSdkError } from '@blackout/sdk';

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
// Per-test room. Undefined (no room loaded) unless a test sets it; the client
// object itself stays stable so the composer's room memo behaves as in the app.
let currentRoom: ReturnType<typeof makeRoom> | undefined;
const fakeMatrixClient = {
    getRoom: () => currentRoom,
    getUserId: () => '@me:test',
};
vi.mock('../../../../src/app/hooks/useMatrixClient', () => ({
    useMatrixClient: () => fakeMatrixClient,
}));
// The encryption indicator reads the m.room.encryption state event through this
// hook; answer from the same per-test room.
vi.mock('../../../../src/app/hooks/useStateEvent', () => ({
    useStateEvent: () =>
        currentRoom?.hasEncryptionStateEvent() ? { getContent: () => ({}) } : undefined,
}));
vi.mock('../../../../src/app/features/room/attachments/useAttachPhoto', () => ({
    useAttachPhoto: () => vi.fn(),
}));
vi.mock('../../../../src/app/features/room/scheduledMessagesClient', () => ({
    createScheduledMessage: (...args: unknown[]) => createScheduledMessage(...args),
}));

import {
    ENCRYPTED_ROOM_NOTICE,
    MessageComposer,
    UNENCRYPTED_ROOM_NOTICE,
    toHtml,
} from '../../../../src/app/features/room/MessageComposer';

/** A minimal room: just what the composer reads. `encrypted` can flip mid-test. */
function makeRoom(encrypted: boolean) {
    const room = {
        roomId: '!room:test',
        encrypted,
        hasEncryptionStateEvent: () => room.encrypted,
        getMember: () => null,
        currentState: { getStateEvents: () => null },
    };
    return room;
}

const ENCRYPTED_REASON =
    'Not available in encrypted rooms. The Blackout bot sends scheduled messages and cannot encrypt them.';

// Track every root we mount so afterEach can unmount them. Without unmounting,
// slate-react's <Editable> never runs its effect cleanup, leaving a debounced
// DOM-selection scheduler pending; it fires after the jsdom environment is torn
// down and throws "ReferenceError: ShadowRoot is not defined" as an unhandled
// error. That surfaces only in full-suite parallel runs (not in isolation) and,
// under --coverage, fails the whole run's exit code despite every test passing.
const mountedRoots: ReactDOM.Root[] = [];

const mountComposer = async (props: { roomId?: string; initialMarkdown?: string } = {}) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    mountedRoots.push(root);
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
    currentRoom = undefined;
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

const statusText = (container: HTMLElement) =>
    [...container.querySelectorAll('[role="status"]')].map((el) => el.textContent).join(' ');

// Let a rejected API call and the state updates after it settle.
const settle = async () => {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
};

afterEach(async () => {
    // Unmount inside act so slate-react flushes its effect cleanup synchronously,
    // cancelling the pending DOM-selection scheduler before jsdom is torn down.
    await act(async () => {
        mountedRoots.splice(0).forEach((root) => root.unmount());
        await Promise.resolve();
    });
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

    // Workstream B1 dogfood: the toolbar marks are @blackout/ui IconButtons
    // (toggles expose aria-pressed) and the send action is a @blackout/ui
    // Button. These assert the primitives are actually wired into a production
    // path rather than re-inlined.
    it('drives the toolbar and send action through @blackout/ui primitives', async () => {
        const { container } = await mountComposer();
        const bold = findButton(container, 'B');
        expect(bold?.getAttribute('aria-pressed')).toBe('false');
        const send = findButton(container, 'Send');
        expect(send?.getAttribute('type')).toBe('button');
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

    it('C-1: in an encrypted room the scheduled-send preset is disabled, with the reason shown', async () => {
        currentRoom = makeRoom(true);
        const { container } = await mountComposer({ initialMarkdown: 'secret plans' });

        await click(findByLabel(container, 'Open composer features'));
        const preset = findButton(container, 'Scheduled send preset');
        expect(preset).toBeTruthy();
        expect(preset?.disabled).toBe(true);
        expect(container.textContent).toContain(ENCRYPTED_REASON);

        await click(preset);
        expect(container.textContent).not.toContain('Schedule: +');

        await click(findButton(container, 'Send'));
        expect(createScheduledMessage).not.toHaveBeenCalled();
        expect(sendRichText).toHaveBeenCalledTimes(1);
    });

    it('C-2: a room that became encrypted after scheduling was turned on gets neither a schedule nor a send', async () => {
        currentRoom = makeRoom(false);
        const { container } = await mountComposer({
            roomId: '!room:test',
            initialMarkdown: 'later message',
        });

        await click(findByLabel(container, 'Open composer features'));
        await click(findButton(container, 'Scheduled send preset'));
        expect(container.textContent).toContain('Schedule: +1h');

        currentRoom.encrypted = true;
        await click(findButton(container, 'Send'));
        await settle();

        expect(createScheduledMessage).not.toHaveBeenCalled();
        expect(sendRichText).not.toHaveBeenCalled();
        expect(statusText(container)).toContain(ENCRYPTED_REASON);
        expect(window.localStorage.getItem('blackout.draft.!room:test')).toContain('later message');
    });

    it('C-3: an API refusal keeps the draft and says why', async () => {
        currentRoom = makeRoom(false);
        createScheduledMessage.mockRejectedValueOnce(
            new BlackoutSdkError('HTTP_REQUEST_FAILED', 'Request failed (409)', 'fatal', 409)
        );
        const { container } = await mountComposer({
            roomId: '!room:test',
            initialMarkdown: 'later message',
        });

        await click(findByLabel(container, 'Open composer features'));
        await click(findButton(container, 'Scheduled send preset'));
        await click(findButton(container, 'Send'));
        await settle();

        expect(createScheduledMessage).toHaveBeenCalledTimes(1);
        expect(sendRichText).not.toHaveBeenCalled();
        expect(statusText(container)).toContain(
            "Scheduling isn't available in this room. It is encrypted, or the Blackout bot isn't in it."
        );
        expect(window.localStorage.getItem('blackout.draft.!room:test')).toContain('later message');
    });

    it('C-3: a failed room check asks to try again, and a refusal to post says so', async () => {
        currentRoom = makeRoom(false);
        createScheduledMessage
            .mockRejectedValueOnce(
                new BlackoutSdkError(
                    'HTTP_REQUEST_FAILED',
                    'Request failed (503)',
                    'retryable',
                    503
                )
            )
            .mockRejectedValueOnce(
                new BlackoutSdkError('HTTP_REQUEST_FAILED', 'Request failed (403)', 'fatal', 403)
            );
        const { container } = await mountComposer({ initialMarkdown: 'later message' });

        await click(findByLabel(container, 'Open composer features'));
        await click(findButton(container, 'Scheduled send preset'));
        await click(findButton(container, 'Send'));
        await settle();
        expect(statusText(container)).toContain("Couldn't check the room. Try again.");

        await click(findButton(container, 'Send'));
        await settle();
        expect(statusText(container)).toContain("You can't post in this room.");
        expect(sendRichText).not.toHaveBeenCalled();
    });

    it('C-4: in an unencrypted room the schedule chip says the bot sends it unencrypted', async () => {
        currentRoom = makeRoom(false);
        const { container } = await mountComposer({ initialMarkdown: 'later message' });

        await click(findByLabel(container, 'Open composer features'));
        const preset = findButton(container, 'Scheduled send preset');
        expect(preset?.disabled).toBe(false);
        await click(preset);
        expect(container.textContent).toContain('sent unencrypted by the Blackout bot');
    });

    it('a send refused because the room is not loaded says so, and keeps the draft', async () => {
        const { RoomNotReadyError } = await import(
            '../../../../src/app/features/room/roomSendGuard'
        );
        sendRichText.mockRejectedValueOnce(new RoomNotReadyError());
        const { container } = await mountComposer({ initialMarkdown: 'first message' });

        await click(findButton(container, 'Send'));
        await settle();

        expect(container.querySelector('[data-testid="send-failure"]')?.textContent).toBe(
            'This room has not finished loading, so nothing was sent. Try again shortly.'
        );
        expect(container.textContent).toContain('first message');

        // The same draft goes out on the next try, and the notice goes away.
        await click(findButton(container, 'Send'));
        await settle();
        expect(sendRichText).toHaveBeenCalledTimes(2);
        expect(container.querySelector('[data-testid="send-failure"]')).toBeNull();
    });

    it('a file refused because encryption was turned on mid-upload says where the copy went', async () => {
        const { AttachmentEncryptionChangedError } = await import(
            '../../../../src/app/features/media/utils/roomAttachment'
        );
        currentRoom = makeRoom(true);
        sendMedia.mockRejectedValueOnce(new AttachmentEncryptionChangedError());
        const { container } = await mountComposer();

        const input = container.querySelector('input[type="file"][multiple]') as HTMLInputElement;
        Object.defineProperty(input, 'files', {
            value: [new File(['x'], 'plan.txt', { type: 'text/plain' })],
            configurable: true,
        });
        await act(async () => {
            input.dispatchEvent(new Event('change', { bubbles: true }));
            await Promise.resolve();
        });
        await settle();
        await click(findButton(container, 'Send'));
        await settle();

        const notice = container.querySelector('[data-testid="send-failure"]')?.textContent;
        expect(notice).toContain('The file was not posted to the room.');
        expect(notice).toContain('A copy without encryption reached the server');
    });

    it('any other failed send is reported without claiming that nothing was sent', async () => {
        sendRichText.mockRejectedValueOnce(new Error('M_LIMIT_EXCEEDED'));
        const { container } = await mountComposer({ initialMarkdown: 'hello' });

        await click(findButton(container, 'Send'));
        await settle();

        expect(container.querySelector('[data-testid="send-failure"]')?.textContent).toBe(
            'Something was not sent. Your draft is still here: check the conversation before sending again.'
        );
        expect(container.textContent).toContain('hello');
    });

    it('the lock says what the server can and cannot see in an encrypted room, files included', async () => {
        currentRoom = makeRoom(true);
        const { container } = await mountComposer();

        await click(findByLabel(container, 'Room is end-to-end encrypted. Show what this means.'));
        const notice = container.querySelector('[role="tooltip"]')?.textContent;
        expect(notice).toBe(ENCRYPTED_ROOM_NOTICE);
        expect(notice).toContain('Messages and files you send here are encrypted on this device');
        // The exceptions stay attached to the claim.
        expect(notice).toContain("the room's name and members");
        expect(notice).toContain('how large they are');
        expect(notice).toContain('emoji reactions');
    });

    it('the lock says messages and files are stored unencrypted in a room without encryption', async () => {
        currentRoom = makeRoom(false);
        const { container } = await mountComposer();

        await click(findByLabel(container, 'Room is not encrypted. Show what this means.'));
        const notice = container.querySelector('[role="tooltip"]')?.textContent;
        expect(notice).toBe(UNENCRYPTED_ROOM_NOTICE);
        expect(notice).toContain('Messages and files are stored unencrypted on the server');
    });

    // The composer never sees a media URL of its own: the send hook hands it
    // where the upload landed, and the composer spreads that into the message.
    // An encrypted upload must come out as `file`, with no `url` beside it.
    it('builds an attachment message from the upload source it is given: `file` when encrypted, `url` when not', async () => {
        currentRoom = makeRoom(true);
        const { container } = await mountComposer();

        const attachment = new File(['minutes of the meeting'], 'minutes.txt', {
            type: 'text/plain',
        });
        const input = container.querySelector('input[type="file"][multiple]') as HTMLInputElement;
        Object.defineProperty(input, 'files', { value: [attachment], configurable: true });
        await act(async () => {
            input.dispatchEvent(new Event('change', { bubbles: true }));
            await Promise.resolve();
        });
        await settle();

        await click(findButton(container, 'Send'));
        await settle();

        expect(sendMedia).toHaveBeenCalledTimes(1);
        const [sentFile, options] = sendMedia.mock.calls[0] as [
            File,
            { buildContent: (source: Record<string, unknown>) => Record<string, unknown> }
        ];
        expect(sentFile.name).toBe('minutes.txt');

        const file = {
            url: 'mxc://example.org/ciphertext',
            v: 'v2',
            key: {
                alg: 'A256CTR',
                key_ops: ['encrypt', 'decrypt'],
                kty: 'oct',
                k: 'a2V5',
                ext: true,
            },
            iv: 'aXY',
            hashes: { sha256: 'aGFzaA' },
        };
        const encryptedContent = options.buildContent({ file });
        expect(encryptedContent).toEqual({
            msgtype: 'm.file',
            body: 'minutes.txt',
            file,
            info: { mimetype: 'text/plain', size: attachment.size },
        });
        expect('url' in encryptedContent).toBe(false);

        const plainContent = options.buildContent({ url: 'mxc://example.org/plain' });
        expect(plainContent.url).toBe('mxc://example.org/plain');
        expect('file' in plainContent).toBe(false);
    });

    // Mentions and links are inline element nodes nested inside a paragraph's
    // children. Serializing them used to call the text-leaf path on those nodes,
    // reading `.text` off undefined and throwing in escapeHtml — which crashed
    // the send handler for any message containing an @mention or auto-linked URL.
    it('serializes a mention nested inside a paragraph without throwing', () => {
        const html = toHtml([
            {
                type: 'paragraph',
                children: [
                    { text: 'hey ' },
                    {
                        type: 'mention',
                        mentionKind: 'user',
                        id: '@bob:server',
                        label: 'bob',
                        children: [{ text: '' }],
                    },
                    { text: ' welcome' },
                ],
            },
        ] as never);

        expect(html).toBe('<p>hey <a href="https://matrix.to/#/@bob:server">bob</a> welcome</p>');
    });

    it('serializes a link nested inside a paragraph without throwing', () => {
        const html = toHtml([
            {
                type: 'paragraph',
                children: [
                    { text: 'see ' },
                    {
                        type: 'link',
                        href: 'https://example.com',
                        children: [{ text: 'https://example.com' }],
                    },
                ],
            },
        ] as never);

        expect(html).toBe('<p>see <a href="https://example.com">https://example.com</a></p>');
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
