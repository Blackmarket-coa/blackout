// @vitest-environment jsdom
//
// A message sent to a room this client has not loaded yet.
//
// The Matrix SDK decides whether to encrypt an event from the room object it
// holds. For a room it does not hold it sends the event as it is: the first
// test shows that with the real SDK and a recorded request. A composer can be
// on screen for such a room (a conversation just created, or a deep link
// opened before the first sync), so the send hooks refuse instead.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Room, createClient, type MatrixClient } from 'matrix-js-sdk';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sent: Array<{ roomId: string; type: string; content: Record<string, unknown> }> = [];
let knownRoom: { hasEncryptionStateEvent: () => boolean } | null = null;

const client = {
    getRoom: () => knownRoom,
    getCrypto: () => ({ isEncryptionEnabledInRoom: async () => false }),
    uploadContent: vi.fn(async () => ({ content_uri: 'mxc://example.org/x' })),
    sendEvent: vi.fn(async (roomId: string, type: string, content: Record<string, unknown>) => {
        sent.push({ roomId, type, content });
        return { event_id: '$sent' };
    }),
};

vi.mock('../../../../src/app/plugins/matrix-adapters/hooks/useLegacyMatrixClientAdapter', () => ({
    useLegacyMatrixClientAdapter: () => client,
}));
vi.mock('../../../../src/app/plugins/matrix-adapters/hooks/useLegacyRoomAdapter', () => ({
    useLegacyRoomAdapter: () => ({ data: null, loading: false, error: null }),
}));

import {
    useLegacyEditMessageAdapter,
    useLegacySendMessageAdapter,
} from '../../../../src/app/plugins/matrix-adapters/hooks/useLegacyTimelineAdapter';
import {
    RoomNotReadyError,
    refuseSendsToUnloadedRooms,
} from '../../../../src/app/features/room/roomSendGuard';

const ROOM = '!not-loaded:example.org';

type Hooks = {
    send: ReturnType<typeof useLegacySendMessageAdapter>;
    edit: ReturnType<typeof useLegacyEditMessageAdapter>;
};

const mountHooks = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    const api: { current: Hooks | null } = { current: null };
    const Probe = () => {
        api.current = {
            send: useLegacySendMessageAdapter(ROOM),
            edit: useLegacyEditMessageAdapter(ROOM),
        };
        return null;
    };
    await act(async () => {
        root.render(<Probe />);
    });
    return {
        api: () => api.current as Hooks,
        unmount: async () => {
            await act(async () => root.unmount());
            container.remove();
        },
    };
};

const attempt = async (action: () => Promise<unknown>): Promise<unknown> => {
    let failure: unknown;
    await act(async () => {
        await action().catch((err: unknown) => {
            failure = err;
        });
    });
    return failure;
};

beforeEach(() => {
    sent.length = 0;
    knownRoom = null;
    client.sendEvent.mockClear();
    client.uploadContent.mockClear();
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('the Matrix SDK, given a room it has not loaded', () => {
    it('sends the message as plaintext: it cannot tell the room is encrypted', async () => {
        const requests: Array<{ url: string; method?: string; body?: string }> = [];
        const sdk = createClient({
            baseUrl: 'https://hs.example',
            accessToken: 'token-for-test',
            userId: '@me:hs.example',
            deviceId: 'DEVICE',
            fetchFn: (async (input: RequestInfo | URL, init?: RequestInit) => {
                requests.push({
                    url: String(input),
                    method: init?.method,
                    body: typeof init?.body === 'string' ? init.body : undefined,
                });
                return new Response(JSON.stringify({ event_id: '$plain' }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                });
            }) as typeof fetch,
        });

        expect(sdk.getRoom(ROOM)).toBeNull();
        await sdk.sendEvent(
            ROOM,
            'm.room.message' as never,
            {
                msgtype: 'm.text',
                body: 'the meeting is at the old mill',
            } as never
        );

        const send = requests.find((request) => request.url.includes('/send/'));
        expect(send?.method).toBe('PUT');
        expect(send?.url).toContain('/send/m.room.message/');
        expect(send?.url).not.toContain('m.room.encrypted');
        expect(JSON.parse(send?.body ?? '{}')).toEqual({
            msgtype: 'm.text',
            body: 'the meeting is at the old mill',
        });
    });
});

describe('the client, once the guard is applied to it', () => {
    const guardedClient = () => {
        const requests: Array<{ url: string; method?: string; body?: string }> = [];
        const sdk = refuseSendsToUnloadedRooms(
            createClient({
                baseUrl: 'https://hs.example',
                accessToken: 'token-for-test',
                userId: '@me:hs.example',
                deviceId: 'DEVICE',
                fetchFn: (async (input: RequestInfo | URL, init?: RequestInit) => {
                    requests.push({
                        url: String(input),
                        method: init?.method,
                        body: typeof init?.body === 'string' ? init.body : undefined,
                    });
                    return new Response(JSON.stringify({ event_id: '$sent' }), {
                        status: 200,
                        headers: { 'content-type': 'application/json' },
                    });
                }) as typeof fetch,
            })
        );
        return { sdk, requests };
    };

    it.each([
        [
            'sendEvent',
            (sdk: MatrixClient) =>
                sdk.sendEvent(ROOM, 'm.room.message' as never, { body: 'secret' } as never),
        ],
        [
            'sendMessage',
            (sdk: MatrixClient) =>
                sdk.sendMessage(ROOM, { msgtype: 'm.text', body: 'secret' } as never),
        ],
        ['sendTextMessage', (sdk: MatrixClient) => sdk.sendTextMessage(ROOM, 'secret')],
        ['sendNotice', (sdk: MatrixClient) => sdk.sendNotice(ROOM, 'secret')],
        ['sendEmoteMessage', (sdk: MatrixClient) => sdk.sendEmoteMessage(ROOM, 'secret')],
        [
            'sendHtmlMessage',
            (sdk: MatrixClient) => sdk.sendHtmlMessage(ROOM, 'secret', '<b>secret</b>'),
        ],
        [
            'a custom event from a feature',
            (sdk: MatrixClient) =>
                sdk.sendEvent(ROOM, 'co.bmc.proposal' as never, { text: 'secret' } as never),
        ],
    ])('refuses %s to a room it does not hold, and makes no request', async (_name, send) => {
        const { sdk, requests } = guardedClient();

        const failure = await send(sdk).catch((err: unknown) => err);

        expect(failure).toBeInstanceOf(RoomNotReadyError);
        expect(requests.filter((request) => request.url.includes('/send/'))).toEqual([]);
        expect(requests.some((request) => request.body?.includes('secret'))).toBe(false);
    });

    it('still sends to a room it holds', async () => {
        const { sdk, requests } = guardedClient();
        sdk.store.storeRoom(new Room(ROOM, sdk, '@me:hs.example'));

        await sdk.sendTextMessage(ROOM, 'hello');

        const send = requests.find((request) => request.url.includes('/send/m.room.message/'));
        expect(send?.method).toBe('PUT');
        expect(JSON.parse(send?.body ?? '{}')).toMatchObject({ msgtype: 'm.text', body: 'hello' });
    });
});

describe('the send hooks, for a room this client has not loaded', () => {
    it.each([
        ['a text message', (h: Hooks) => h.send.sendText('hello')],
        [
            'a formatted message',
            (h: Hooks) => h.send.sendRichText({ msgtype: 'm.text', body: 'hi' }),
        ],
        ['a reply', (h: Hooks) => h.send.sendReply('hello', '$parent')],
        ['a thread reply', (h: Hooks) => h.send.sendThread('hello', '$root')],
        ['an edit', (h: Hooks) => h.edit('$target', 'corrected text')],
        [
            'a file',
            (h: Hooks) => h.send.sendMedia(new File(['secret'], 'a.txt', { type: 'text/plain' })),
        ],
    ])('refuse %s and send nothing', async (_what, action) => {
        const hooks = await mountHooks();
        const failure = await attempt(() => action(hooks.api()));

        expect(failure).toBeInstanceOf(Error);
        expect((failure as Error).message).toMatch(/has not finished loading/);
        expect(client.sendEvent).not.toHaveBeenCalled();
        expect(client.uploadContent).not.toHaveBeenCalled();
        await hooks.unmount();
    });

    it('send as usual once the room is loaded', async () => {
        knownRoom = { hasEncryptionStateEvent: () => true };
        const hooks = await mountHooks();
        const failure = await attempt(() => hooks.api().send.sendText('hello'));

        expect(failure).toBeUndefined();
        expect(sent).toEqual([
            { roomId: ROOM, type: 'm.room.message', content: { msgtype: 'm.text', body: 'hello' } },
        ]);
        await hooks.unmount();
    });
});
